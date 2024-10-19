/*!
   Fast Ternary String Set
   https://github.com/CGJennings/fast-ternary-string-set

   Copyright © 2023 by Christopher Jennings.
   Licensed under an MIT license (see link above for details).
!*/
interface TernaryTreeStats {
    /** The number of strings in the tree. Equivalent to the `size` property. */
    size: number;
    /**
     * The total number of nodes in the tree. For a typical JavaScript engine,
     * the set will consume approximately `nodes * 16` bytes of memory,
     * plus some fixed object overhead.
     */
    nodes: number;
    /** True if the tree structure is compacted. */
    compact: boolean;
    /** The maximum depth (height) of the tree. */
    depth: number;
    /**
     * Width of the tree at each level of tree depth, starting with the root at `breadth[0]`.
     * A deep tree with relatively small breadth values may benefit from being balanced.
     */
    breadth: number[];
    /** The least code point contained in any string in the set. */
    minCodePoint: number;
    /** The greatest code point contained in any string in the set. */
    maxCodePoint: number;
    /** The total number of nodes whose code point spans multiple char codes when stored in a string. */
    surrogates: number;
}

class TernaryStringSet {
    /**
     * Constants
     */
    /** Node index indicating that no node is present. */
    protected static readonly NUL = ~(1 << 31)
    /** First node index that would run off of the end of the array. */
    protected static readonly NODE_CEILING = TernaryStringSet.NUL - 3
    /** End-of-string flag: set on node values when that node also marks the end of a string. */
    protected static readonly EOS = 1 << 21
    /** Mask to extract the code point from a node value, ignoring flags. */
    protected static readonly CP_MASK = TernaryStringSet.EOS - 1
    /** Smallest code point that requires a surrogate pair. */
    protected static readonly CP_MIN_SURROGATE = 0x10000

    /**
     * Tree data, an integer array laid out as follows:
     *
     * 1. `tree[n]`: code point of the character stored in this node, plus bit flags
     * 2. `tree[n+1]`: array index of the "less than" branch's child node
     * 3. `tree[n+2]`: array index of the "equal to" branch's child node
     * 4. `tree[n+3]`: array index of the "greater than" branch's child node
     */
    protected _tree: number[]
    /** Tracks whether empty string is in the set as a special case. */
    protected _hasEmpty: boolean
    /** Tracks whether this tree has been compacted; if true this must be undone before mutating the tree. */
    protected _compact: boolean
    /** Tracks set size. */
    protected _size: number
    /** Stats. */
    protected _stats: TernaryTreeStats = {
        size: 0,
        nodes: 0,
        compact: false,
        depth: 0,
        breadth: [],
        minCodePoint: 0,
        maxCodePoint: 0,
        surrogates: 0,
    }

    /**
     * Creates a new set. The set will be empty unless the optional iterable `source` object
     * is specified. If a `source` is provided, all of its elements will be added to the new set.
     * If `source` contains any element that would cause `add()` to throw an error, the constructor
     * will also throw an error for that element.
     *
     * **Note:** Since strings are iterable, passing a string to the constructor will create
     * a new set containing one string for each unique code point in the source string, and not
     * a singleton set containing just the source string as you might expect.
     *
     * @param source An optional iterable object whose strings will be added to the new set.
     * @throws `TypeError` if a specified source is not iterable.
     */
    constructor(source?: string[] | TernaryStringSet) {
        this.clear()
        if (source != null) {
            if (source instanceof TernaryStringSet) {
                this._tree = source._tree.slice()
                this._hasEmpty = source._hasEmpty
                this._compact = source._compact
                this._size = source._size
            } else {
                this.addAll(source)
            }
        }
    }

    /**
     * Public properties
     */
    public get compacted(): boolean {
        return this._compact
    }

    public get size(): number {
        return this._size
    }

    /**
     * Returns information about this set's underlying tree structure.
     * This method is intended only for testing and performance analysis.
     */
    public get stats(): TernaryTreeStats {
        this.updateStats()
        return this._stats
    }

    /**
     * Public methods
     */
    /**
     * Adds a string to this set. The string can be empty, but cannot be null.
     * Adding a string that is already present has no effect.
     * If inserting multiple strings in sorted order, prefer `addAll`
     * over this method.
     *
     * @param s The non-null string to add.
     */
    public add(s: string): void {
        if (s == null) {
            throw 'Cannot add null string.'
        }
        if (s.length === 0) {
            if (!this._hasEmpty) {
                this._hasEmpty = true
                this._size++
            }
        } else {
            if (this._compact && !this.has(s)) {
                this.decompact()
            }
            this._add(0, s, 0, s.charCodeAt(0))
        }
    }

    /**
     * Adds an entire array, or subarray, of strings to this set. By default,
     * the entire collection is added. If the `start` and/or `end` are specified,
     * only the elements in the specified range are added.
     *
     * If the collection is sorted in ascending order and no other strings have been
     * added to this set, the underlying tree is guaranteed to be balanced, ensuring
     * good search performance. If the collection is in random order, the tree is *likely*
     * to be nearly balanced.
     *
     * @param strings The non-null collection of strings to add.
     * @param start The optional index of the first element to add (inclusive, default is 0).
     * @param end The optional index of the last element to add (exclusive, default is `strings.length`)
     * @throws `ReferenceError` if the collection is null.
     * @throws `RangeError` if the start or end are out of bounds, that is, less than 0
     *   or greater than `strings.length`.
     */
    public addAll(strings: string[], start: number = 0, end: number = null): void {
        if (strings == null) {
            throw 'addAll(): collection cannot be null.'
        }
        const len: number = strings.length
        if (start !== Math.trunc(start)) {
            throw 'addAll(): start must be an integer.'
        }
        if (end == null) {
            end = len
        }
        if (end !== Math.trunc(end)) {
            throw 'addAll(): end must be an integer.'
        }
        if (start < 0 || start > len) {
            throw `addAll(): start: ${start} is out of range.`
        }
        if (end < 0 || end > len) {
            throw `addAll(): end: ${end} is out of range.`
        }
        if (start < end) {
            this._addAll(strings, start, end)
        }
    }


    /**
     * Balances the tree structure, minimizing the depth of the tree.
     * This may improve search performance, especially after adding or deleting a large
     * number of strings.
     *
     * It is not normally necessary to call this method as long as care was taken not
     * to add large numbers of strings in lexicographic order. That said, two scenarios
     * where this methof may be particularly useful are:
     *  - If the set will be used in two phases, with strings being added in one phase
     *    followed by a phase of extensive search operations.
     *  - If the string is about to be serialized to a buffer for future use.
     *
     * As detailed under `addAll`, if the entire contents of the set were added by a single
     * call to `addAll` using a sorted array, the tree is already balanced and calling this
     * method will have no benefit.
     *
     * **Note:** This method undoes the effect of `compact()`. If you want to balance and
     * compact the tree, be sure to balance it first.
     */
    public balance(): void {
        this._tree = new TernaryStringSet(this.toArray())._tree
        this._compact = false
    }

    public static checkDistance(distance: number): number {
        if (distance !== distance) {
            throw "Distance is not a number."
        }
        if (distance < 0) {
            throw "Distance must be non-negative."
        }
        return Math.min(Math.trunc(distance), TernaryStringSet.NUL)
    }

    /**
     * Removes all strings from this set.
     */
    public clear(): void {
        this._tree = []
        this._hasEmpty = false
        this._compact = false
        this._size = 0
    }

    /**
     * Compacts the set to reduce its memory footprint and improve search performance.
     * Compaction allows certain nodes of the underlying tree to be shared, effectively
     * converting it to a graph. For large sets, the result is typically a *significantly*
     * smaller footprint. The tradeoff is that compacted sets cannot be mutated.
     * Any attempt to do so, such as adding or deleting a string, will automatically
     * decompact the set to a its standard tree form, if necessary, before performing
     * the requested operation.
     *
     * Compaction is an excellent option if the primary purpose of a set is matching
     * or searching against a fixed string collection. Since compaction and decompaction
     * are both expensive operations, it may not be suitable if the set is expected to
     * be modified intermittently.
     */
    public compact(): void {
        if (this._compact || this._tree.length == 0) {
            return
        }

        /*

        Theory of operation:
        
        In a ternary tree, all strings with the same prefix share the nodes
        that make up that prefix. The compact operation does much the same thing,
        but for suffixes. It does this by deduplicating identical tree nodes.
        For example, every string that ends in "e" and is not a prefix of any other
        strings looks the same: an "e" node with three NUL child branch pointers.
        But these can be distributed throughout the tree. Consider a tree containing only
        "ape" and "haze": we could save space by having only a single copy of the "e" node
        and pointing to it from both the "p" node and the "z" node.
        
        So: to compact the tree, we iterate over each node and build a map of all unique nodes.
        The first time we come across a node, we add it to the map, mapping the node to
        a number which is the next available slot in the new, compacted, output array we will write.

        Once we have built the map, we iterate over the nodes again. This time we look up each node
        in the previously built map to find the slot it was assigned in the output array. If the
        slot is past the end of the array, then we haven't added it to the output yet. We can
        write the node's value unchanged, but the three pointers to the child branches need to
        be rewritten to point to the new, deduplicated equivalent of the nodes that they point to now.
        Thus for each branch, if the pointer is NUL we write it unchanged. Otherwise we look up the node
        that the branch points to in our unique node map to get its new slot number (i.e. array offset)
        and write the translated address.

        After doing this once, we will have deduplicated just the leaf nodes. In the original tree,
        only nodes with no children can be duplicates, because their branches are all NUL.
        But after rewriting the tree, some of the parents of those leaf nodes may now point to
        *shared* leaf nodes, so they themselves might now have duplicates in other parts of the tree.
        So, we can repeat the rewriting step above to remove these newly generated duplicates as well.
        This may again lead to new duplicates, and so on: rewriting continues until the output
        doesn't shrink anymore.

        */
        let source: number[] = this._tree
        this._tree = null
        while (true) {
            const compacted: number[] = TernaryStringSet.compactionPass(source)
            if (compacted.length === source.length) {
                this._tree = compacted
                break
            }
            source = compacted
        }
        this._compact = true
    }

    /**
     * Removes the specified string from this set, if it is present.
     * If it is not present, this has no effect.
     * Non-strings are accepted, but treated as if they are not present.
     *
     * @param s The non-null string to delete.
     * @returns True if the string was in this set; false otherwise.
     */
    public delete(s: string): boolean {
        if (s == null) {
            throw 'Cannot delete null string.'
        }
        if (s.length === 0) {
            const had = this._hasEmpty
            if (had) {
                this._hasEmpty = false
                --this._size
            }
            return had
        }
        if (this._compact && this.has(s)) {
            this.decompact()
        }
        return this._delete(0, s, 0, s.charCodeAt(0))
    }

    /**
     * Removes multiple elements from this set.
     *
     * @param elements The elements to remove.
     * @returns true if every element was present and was removed.
     */
    public deleteAll(elements: string[]): boolean {
        if (elements == null) {
            return false
        }
        let allDeleted: boolean = true
        for (const el of elements) {
            allDeleted = this.delete(el) && allDeleted
        }
        return allDeleted
    }


    /**
     * Calls the specified callback function once for each string in this set, passing the string
     * and this set. The string is passed as both value and key to align with `Map.forEach`.
     *
     * @param callbackFn The function to call for each string.
     */
    public forEach(
        callbackFn: (value: string, key: string, set: TernaryStringSet) => void
    ): void {
        if (this._hasEmpty) {
            const s: string = ""
            callbackFn(s, s, this)
        }
        this.visitCodePoints(0, [], (prefix) => {
            const s: string = TernaryStringSet.fromCodePoints(prefix)
            callbackFn(s, s, this)
        })
    }

    public static fromCodePoints(s: number[]): string {
        let toReturn: string = ''
        for (let c of s) {
            toReturn += String.fromCharCode(c)
        }
        return toReturn
    }

    /**
     * Returns all strings in this set that can be composed from combinations of the code points
     * in the specified string. Unlike an anagram, all of the code points need not to appear for a match
     * to count. For example, the pattern `"coat"` can match `"cat"` even though the *o* is not used.
     * However, characters cannot appear *more often* than they appear in the pattern string. The same
     * pattern `"coat"` cannot match `"tot"` since it includes only a single *t*.
     *
     * If this set contains the empty string, it is always included in results from this
     * method.
     *
     * @param charPattern The non-null pattern string.
     * @returns A (possibly empty) array of strings from the set that can be composed from the
     *     pattern characters.
     * @throws `ReferenceError` if the pattern is null.
     */
    public getArrangementsOf(charPattern: string): string[] {
        if (charPattern == null) {
            throw 'Pattern cannot be null.'
        }
        
        // availChars[codePoint] = How many times codePoint appears in pattern.
        const availChars: number[] = []
        for (let i: number = 0; i < charPattern.length;) {
            const cp: number = charPattern.charCodeAt(i++)
            if (cp >= TernaryStringSet.CP_MIN_SURROGATE) {
                i++
            }
            availChars[cp] = availChars[cp] ? availChars[cp] + 1 : 1
        }

        const matches: string[] = this._hasEmpty ? [""] : []
        this._getArrangementsOf(0, availChars, [], matches)
        return matches
    }

    /**
     * Returns an array of possible completions for the specified prefix string.
     * That is, an array of all strings in the set that start with the prefix.
     * If the prefix itself is in the set, it is included as the first entry.
     *
     * @param prefix The non-null pattern to find completions for.
     * @returns A (possibly empty) array of all strings in the set for which the
     *     pattern is a prefix.
     * @throws `ReferenceError` if the pattern is null.
     */
    public getCompletionsOf(prefix: string): string[] {
        if (prefix == null)
        {
            throw 'Prefix cannot be null.'
        }
        if (prefix.length === 0) {
            return this.toArray()
        }

        const results: string[] = []
        const pat = TernaryStringSet.toCodePoints(prefix)
        let node: number = this.hasCodePoints(0, pat, 0)
        if (node < 0) {
            node = -node - 1
            // Prefix is not in tree; no children are, either.
            if (node >= this._tree.length) {
                return results
            }
            // Prefix is in tree, but it not itself in the set.
        } else {
            // Prefix is in tree and also in set.
            results.push(prefix)
        }

        // Continue from end of prefix by taking the equal branch.
        this.visitCodePoints(this._tree[node + 2], pat, (s) => {
            results.push(TernaryStringSet.fromCodePoints(s))
        })
        return results
    }

    /**
     * Returns an array of the strings that are completed by the specified suffix string.
     * That is, an array of all strings in the set that end with the suffix,
     * including the suffix itself if appropriate.
     *
     * @param suffix The non-null pattern to find completions for.
     * @returns A (possibly empty) array of all strings in the set for which the
     *     pattern is a suffix.
     * @throws `ReferenceError` if the pattern is null.
     */
    public getCompletedBy(suffix: string): string[] {
        if (suffix == null) {
            throw 'Suffix cannot be null.'
        }
        if (suffix.length === 0) {
            return this.toArray()
        }
        const results: string[] = []
        const pat: number[] = TernaryStringSet.toCodePoints(suffix)

        // Unlike getCompletionsOf, we have to search the entire tree.
        this.visitCodePoints(0, [], (s) => {
            if (s.length >= pat.length) {
                for (let i: number = 1; i <= pat.length; ++i) {
                    if (s[s.length - i] !== pat[pat.length - i]) {
                        return
                    }
                }
                results.push(TernaryStringSet.fromCodePoints(s))
            }
        })
        return results
    }

    /**
     * Returns all strings that match the pattern. The pattern may include zero or
     * more "don't care" characters that can match any code point. By default this
     * character is `"."`, but any valid code point can be used. For example, the
     * pattern `"c.t"` would match any of `"cat"`, `"cot"`, or `"cut"`, but not `"cup"`.
     *
     * @param pattern A pattern string matched against the strings in the set.
     * @param dontCareChar The character that can stand in for any character in the pattern.
     *     Only the first code point is used. (Default is `"."`.)
     * @returns A (possibly empty) array of strings that match the pattern string.
     * @throws `ReferenceError` if the pattern or don't care string is null.
     * @throws `TypeError` if the don't care string is empty.
     */
    public getPartialMatchesOf(pattern: string, dontCareChar: string = null): string[] {
        if (pattern == null) {
            throw "Null pattern."
        }
        if (dontCareChar == null) {
            // throw "Null dontCareChar."
            dontCareChar = "."
        }
        if (dontCareChar.length === 0) {
            throw "Empty dontCareChar."
        }
        if (pattern.length === 0) {
            return this._hasEmpty ? [""] : []
        }

        const dc = dontCareChar.charCodeAt(0)
        const matches: string[] = []
        this._getPartialMatchesOf(0, pattern, 0, dc, [], matches)
        return matches
    }

    /**
     * Returns an array of all strings in the set that are within the specified edit distance
     * of the given pattern string. A string is within edit distance *n* of the pattern if
     * it can be transformed into the pattern with no more than *n* insertions, deletions,
     * or substitutions. For example:
     *  - `cat` is edit distance 0 from itself;
     *  - `at` is edit distance 1 from `cat` (1 deletion);
     *  - `cot` is edit distance 1 from `cat` (1 substitution); and
     *  - `coats` is edit distance 2 from `cat` (2 insertions).
     *
     * @param pattern A pattern string matched against the strings in the set.
     * @param distance The maximum number of edits to apply to the pattern string.
     *   May be Infinity to allow any number of edits.
     * @returns A (possibly empty) array of strings from the set that match the pattern.
     * @throws `ReferenceError` if the pattern is null.
     * @throws `TypeError` if the distance is not a number.
     * @throws `RangeError` if the distance is negative.
     */
    public getWithinEditDistanceOf(pattern: string, distance: number): string[] {
        if (pattern == null) {
            throw "Null pattern."
        }

        distance = TernaryStringSet.checkDistance(distance)

        // Only the string itself is within distance 0.
        if (distance < 1) {
            return this.has(pattern) ? [pattern] : []
        }

        // Once we start inserting and deleting characters,
        // a standard traversal no longer guarantees sorted order.
        // So, instead of collecting results in an array,
        // we collect them in a temporary set.
        const results: TernaryStringSet = new TernaryStringSet()

        // Add "" if we can delete the pattern down to it.
        if (this._hasEmpty && pattern.length <= distance) {
            results.add("")
        }

        // We avoid redundant work by computing possible deletions
        // ahead of time (*e.g.*, aaa deletes to aa 3 different ways).
        let patterns: TernaryStringSet = new TernaryStringSet()
        patterns.add(pattern)
        for (let d: number = distance; d >= 0; --d) {
            const reducedPatterns: TernaryStringSet = new TernaryStringSet()
            if (patterns._hasEmpty) {
                this._getWithinEditDistanceOf(0, [], 0, d, [], results)
            }

            // Make patterns for the next iteration by deleting
            // each character in turn from this iteration's patterns.
            // abc => ab ac bc => a b c => empty string
            patterns.visitCodePoints(0, [], (cp) => {
                this._getWithinEditDistanceOf(0, cp, 0, d, [], results)
                if (d > 0 && cp.length > 0) {
                    if (cp.length === 1) {
                        reducedPatterns._hasEmpty = true
                    } else {
                        const delete1: number[] = []
                        for (let i: number = 0; i < cp.length; ++i) {
                            for (let j: number = 0; j < i; ++j) {
                                delete1[j] = cp[j]
                            }
                            for (let j = i + 1; j < cp.length; ++j) {
                                delete1[j - 1] = cp[j]
                            }
                            reducedPatterns.addCodePoints(0, delete1, 0)
                        }
                    }
                }
            })
            if (patterns._hasEmpty) {
                this._getWithinEditDistanceOf(0, [], 0, d, [], results)
            }
            patterns = reducedPatterns
        }
        return results.toArray()
    }

    /**
     * Returns an array of all strings in the set that are within the specified Hamming distance
     * of the given pattern string. A string is within Hamming distance *n* of the pattern if at
     * most *n* of its code points are different from those of the pattern. For example:
     *  - `cat` is Hamming distance 0 from itself;
     *  - `cot` is Hamming distance 1 from `cat`;
     *  - `cop` is Hamming distance 2 from `cat`; and
     *  - `top` is Hamming distance 3 from `cat`.
     *
     * @param pattern A pattern string matched against the strings in the set.
     * @param distance The maximum number of code point deviations to allow from the pattern string.
     *     May be Infinity to allow any number.
     * @returns A (possibly empty) array of strings from the set that match the pattern.
     * @throws `ReferenceError` if the pattern is null.
     * @throws `TypeError` if the distance is not a number.
     * @throws `RangeError` if the distance is negative.
     */
    public getWithinHammingDistanceOf(pattern: string, distance: number): string[] {
        if (pattern == null) {
            throw "Null pattern."
        }
        distance = TernaryStringSet.checkDistance(distance)

        // Only the string itself is within distance 0 or matches empty pattern.
        if (distance < 1 || pattern.length === 0) {
            return this.has(pattern) ? [pattern] : []
        }

        const matches: string[] = []

        // Optimize case where any string the same length as the pattern will match.
        if (distance >= pattern.length) {
            this.visitCodePoints(0, [], (prefix) => {
                if (prefix.length === pattern.length) {
                    matches.push(TernaryStringSet.fromCodePoints(prefix))
                }
            })
            return matches
        }

        this._getWithinHammingDistanceOf(0, pattern, 0, distance, [], matches)
        return matches
    }

    /**
     * Returns whether this set contains the specified string.
     * If passed a non-string value, returns false.
     *
     * @param s The non-null string to test for.
     * @returns true if the string is present.
     */
    public has(s: string): boolean {
        if (s == null) {
            throw 'Cannot test for null string'
        }
        if (s.length === 0) {
            return this._hasEmpty
        }
        return this._has(0, s, 0, s.charCodeAt(0))
    }

    public toArray(): string[] {
        const a = this._hasEmpty ? [""] : []
        this.visitCodePoints(0, [], (s) => {
            a.push(TernaryStringSet.fromCodePoints(s))
        })
        return a
    }

    /**
     * Converts a string to an array of numeric code points.
     *
     * @param s A non-null string.
     * @returns An array of the code points comprising the string.
     */
    public static toCodePoints(s: string): number[] {
        const cps = []
        for (let i = 0; i < s.length; ) {
            const cp = s.charCodeAt(i++)
            if (cp >= TernaryStringSet.CP_MIN_SURROGATE) {
                ++i
            }
            cps.push(cp)
        }
        return cps
    }

    /**
     * Protected methods
     */
    protected _add(node: number, s: string, i: number, c: number): number {
        const tree: number[] = this._tree

        if (node >= tree.length) {
            node = tree.length
            if (node >= TernaryStringSet.NODE_CEILING) {
                throw '_add(): Cannot add more strings.'
            }
            tree.push(c)
            tree.push(TernaryStringSet.NUL)
            tree.push(TernaryStringSet.NUL)
            tree.push(TernaryStringSet.NUL)
        }

        const treeChar: number = tree[node] & TernaryStringSet.CP_MASK
        if (c < treeChar) {
            tree[node + 1] = this._add(tree[node + 1], s, i, c)
        } else if (c > treeChar) {
            tree[node + 3] = this._add(tree[node + 3], s, i, c)
        } else {
            i += c >= TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1
            if (i >= s.length) {
                if ((tree[node] & TernaryStringSet.EOS) === 0) {
                    tree[node] |= TernaryStringSet.EOS
                    this._size++
                }
            } else {
                tree[node + 2] = this._add(tree[node + 2], s, i, s.charCodeAt(i))
            }
        }
        return node
    }

    protected _addAll(strings: string[], start: number, end: number): void {
        if (--end < start) {
            return
        }

        /**
         * If the tree is empty and the list is sorted, then
         * insertion by repeated bifurcation ensures a balanced tree.
         * Inserting strings in sorted order is a degenerate case.
         */
        const mid: number = Math.trunc(start + (end - start) / 2)
        this.add(strings[mid])
        this._addAll(strings, start, mid)
        this._addAll(strings, mid + 1, end + 1)
    }

    /**
     * Adds a string described as an array of numeric code points.
     * Does not handle adding empty strings.
     * Does not check if the tree needs to be decompacted.
     *
     * @param node The subtree from which to begin adding (0 for root).
     * @param s The non-null array of code points to add.
     * @param i The array index of the code point to start from (0 to add entire string).
     */
    protected addCodePoints(node: number, s: number[], i: number): number {
        const tree = this._tree
        const cp = s[i]

        if (node >= tree.length) {
            node = tree.length
            if (node >= TernaryStringSet.NODE_CEILING) {
                throw "Cannot add more strings."
            }
            tree.push(cp)
            tree.push(TernaryStringSet.NUL)
            tree.push(TernaryStringSet.NUL)
            tree.push(TernaryStringSet.NUL)
        }

        const treeCp = tree[node] & TernaryStringSet.CP_MASK
        if (cp < treeCp) {
            tree[node + 1] = this.addCodePoints(tree[node + 1], s, i)
        } else if (cp > treeCp) {
            tree[node + 3] = this.addCodePoints(tree[node + 3], s, i)
        } else {
            i += cp >= TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1
            if (i >= s.length) {
                if ((tree[node] & TernaryStringSet.EOS) === 0) {
                    tree[node] |= TernaryStringSet.EOS
                    ++this._size
                }
            } else {
                tree[node + 2] = this.addCodePoints(tree[node + 2], s, i)
            }
        }

        return node
    }

    /**
     * Performs a single compaction pass; see the `compact()` method.
     */
    protected static compactionPass(tree: number[]): number[] {
        /**
         * Nested sparse arrays are used to map node offsets ("pointers")
         * in the original tree array to "slots" (a node's index in the new array).
         */
        let nextSlot: number = 0
        const nodeMap: number[][][][] = []

        /**
         * If a node has already been assigned a slot, then return that slot.
         * Otherwise, assign it the next available slot and return that.
         */
        function mapping(i: number): number {
            // slot = nodeMap[value][ltPointer][eqPointer][gtPointer]
            let ltMap = nodeMap[tree[i]]
            if (ltMap == null || ltMap == undefined) {
                nodeMap[tree[i]] = ltMap = []
            }
            let eqMap = ltMap[tree[i + 1]]
            if (eqMap == null || eqMap == undefined) {
                ltMap[tree[i + 1]] = eqMap = []
            }
            let gtMap = eqMap[tree[i + 2]]
            if (gtMap == null || gtMap == undefined) {
                eqMap[tree[i + 2]] = gtMap = []
            }
            let slot = gtMap[tree[i + 3]]
            if (slot == null || slot == undefined) {
                gtMap[tree[i + 3]] = slot = nextSlot
                nextSlot += 4
            }
            return slot
        }

        // Create a map of unique nodes.
        for (let i: number = 0; i < tree.length; i += 4) {
            mapping(i)
        }

        // Check if the tree would shrink before bothering to rewrite it.
        if (nextSlot === tree.length) {
            return tree
        }

        // Rewrite tree.
        const compactTree: number[] = []
        for (let i: number = 0; i < tree.length; i += 4) {
            const slot = mapping(i)

            /**
             * If the unique version of the node hasn't been written yet,
             * then append it to the output array.
             */
            if (slot >= compactTree.length) {
                if (slot > compactTree.length) {
                    throw "Assertion error in CompactionPass."
                }

                // Write the node value unchanged.
                compactTree[slot] = tree[i]

                /**
                 * Write the pointers for each child branch,
                 * but use the new slot for whatever child node is found there.
                 */
                compactTree[slot + 1] = mapping(tree[i + 1])
                compactTree[slot + 2] = mapping(tree[i + 2])
                compactTree[slot + 3] = mapping(tree[i + 3])
            }
        }

        return compactTree
    }

    /**
     * If the tree is currently compacted,
     * convert it to loose (non-compact) form.
     */
    protected decompact(): void {
        if (this._compact) {
            this.balance()
        }
    }

    protected _delete(node: number, s: string, i: number, c: number): boolean {
        const tree: number[] = this._tree
        if (node >= tree.length) {
            return false
        }
        const treeChar: number = tree[node] & TernaryStringSet.CP_MASK
        if (c < treeChar) {
            return this._delete(tree[node + 1], s, i, c)
        } else if (c > treeChar) {
            return this._delete(tree[node + 3], s, i, c)
        } else {
            i += c > TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1
            if (i >= s.length) {
                const had = (tree[node] & TernaryStringSet.EOS) === TernaryStringSet.EOS
                if (had) {
                    tree[node] &= TernaryStringSet.CP_MASK
                    --this._size
                }
                return had
            } else {
                return this._delete(tree[node + 2], s, i, s.charCodeAt(i))
            }
        }
    }

    protected _getArrangementsOf(node: number, availChars: number[], prefix: number[], matches: string[]) {
        const tree = this._tree
        if (node >= tree.length) {
            return
        }
        this._getArrangementsOf(tree[node + 1], availChars, prefix, matches)

        const cp = tree[node] & TernaryStringSet.CP_MASK
        if (availChars[cp] > 0) {
            availChars[cp]--
            prefix.push(cp)
            if (tree[node] & TernaryStringSet.EOS) {
                matches.push(this.getStringFromCharArray(prefix))
            }
            this._getArrangementsOf(tree[node + 2], availChars, prefix, matches)
            prefix.pop()
            availChars[cp]++
        }
        this._getArrangementsOf(tree[node + 3], availChars, prefix, matches)
    }

    protected _getPartialMatchesOf(
        node: number,
        pattern: string,
        i: number,
        dc: number,
        prefix: number[],
        matches: string[],
    ): void {
        const tree = this._tree
        if (node >= tree.length) {
            return
        }

        const cp = pattern.charCodeAt(i)
        const treeCp = tree[node] & TernaryStringSet.CP_MASK
        if (cp < treeCp || cp === dc) {
            this._getPartialMatchesOf(
                tree[node + 1],
                pattern,
                i,
                dc,
                prefix,
                matches,
            )
        }
        if (cp === treeCp || cp === dc) {
            const i_ = i + (cp >= TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1)
            prefix.push(treeCp)
            if (i_ >= pattern.length) {
                if (tree[node] & TernaryStringSet.EOS) {
                    matches.push(TernaryStringSet.fromCodePoints(prefix))
                }
            } else {
                this._getPartialMatchesOf(
                    tree[node + 2],
                    pattern,
                    i_,
                    dc,
                    prefix,
                    matches,
                )
            }
            prefix.pop()
        }
        if (cp > treeCp || cp === dc) {
            this._getPartialMatchesOf(
                tree[node + 3],
                pattern,
                i,
                dc,
                prefix,
                matches,
            )
        }
    }

    protected getStringFromCharArray(codes: number[]): string {
        let toReturn: string = ""
        for (let c of codes) {
            toReturn += String.fromCharCode(c)
        }
        return toReturn
    }

    protected _getWithinEditDistanceOf(
        node: number,
        pat: number[],
        i: number,
        dist: number,
        prefix: number[],
        out: TernaryStringSet,
    ): void {
        const tree = this._tree
        if (node >= tree.length || dist < 0) {
            return
        }

        const treeCp = tree[node] & TernaryStringSet.CP_MASK
        const eos = tree[node] & TernaryStringSet.EOS

        if (i < pat.length) {
            const cp = pat[i]
            const i_ = i + 1
            const dist_ = dist - 1

            if (cp === treeCp) {
                // Char is a match; most to next char without using dist.
                prefix.push(cp)
                if (eos && i_ + dist >= pat.length) {
                    out.addCodePoints(0, prefix, 0)
                }
                this._getWithinEditDistanceOf(tree[node + 2], pat, i_, dist, prefix, out)
                prefix.pop()
            } else if (dist > 0) {
                // Char is not a match; try with edits.
                prefix.push(treeCp)
                if (eos && i + dist >= pat.length) {
                    out.addCodePoints(0, prefix, 0)
                }

                // Insert the tree's code point ahead of the pattern's.
                this._getWithinEditDistanceOf(tree[node + 2], pat, i, dist_, prefix, out)

                // Substitute the tree's code point for the pattern's.
                this._getWithinEditDistanceOf(tree[node + 2], pat, i_, dist_, prefix, out)
                prefix.pop()
            }
            if (cp < treeCp || dist > 0) {
                this._getWithinEditDistanceOf(tree[node + 1], pat, i, dist, prefix, out)
            }
            if (cp > treeCp || dist > 0) {
                this._getWithinEditDistanceOf(tree[node + 3], pat, i, dist, prefix, out)
            }
        } else if (dist > 0) {
            prefix.push(treeCp)
            if (eos) {
                out.addCodePoints(0, prefix, 0)
            }
            this._getWithinEditDistanceOf(tree[node + 2], pat, i, dist - 1, prefix, out)
            prefix.pop()
            this._getWithinEditDistanceOf(tree[node + 1], pat, i, dist, prefix, out)
            this._getWithinEditDistanceOf(tree[node + 3], pat, i, dist, prefix, out)
        }
    }

    protected _getWithinHammingDistanceOf(
        node: number,
        pat: string,
        i: number,
        dist: number,
        prefix: number[],
        out: string[],
    ): void {
        const tree = this._tree
        if (node >= tree.length || dist < 0) {
            return
        }

        const cp = pat.charCodeAt(i)
        const treeCp = tree[node] & TernaryStringSet.CP_MASK
        if (cp < treeCp || dist > 0) {
            this._getWithinHammingDistanceOf(tree[node + 1], pat, i, dist, prefix, out)
        }

        prefix.push(treeCp)
        if (tree[node] & TernaryStringSet.EOS && pat.length === prefix.length) {
            if (dist > 0 || cp === treeCp) {
                out.push(TernaryStringSet.fromCodePoints(prefix))
            }
            // No need to recurse; children of this equals branch are too long.
        } else {
            const i_ = i + (cp >= TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1)
            const dist_ = dist - (cp === treeCp ? 0 : 1)
            this._getWithinHammingDistanceOf(tree[node + 2], pat, i_, dist_, prefix, out)
        }
        prefix.pop()

        if (cp > treeCp || dist > 0) {
            this._getWithinHammingDistanceOf(tree[node + 3], pat, i, dist, prefix, out)
        }
    }

    protected _has(node: number, s: string, i: number, c: number): boolean {
        const tree = this._tree

        if (node >= tree.length) {
            return false
        }

        const treeChar: number = tree[node] & TernaryStringSet.CP_MASK
        if (c < treeChar) {
            return this._has(tree[node + 1], s, i, c)
        } else if (c > treeChar) {
            return this._has(tree[node + 3], s, i, c)
        } else {
            i += c >= TernaryStringSet.CP_MIN_SURROGATE ? 2 : 1
            if (i >= s.length) {
                return (tree[node] & TernaryStringSet.EOS) === TernaryStringSet.EOS
            } else {
                return this._has(tree[node + 2], s, i, s.charCodeAt(i))
            }
        }
    }

    protected hasCodePoints(node: number, s: number[], i: number): number {
        const tree = this._tree
        if (node >= tree.length) {
            return -node - 1
        }

        const cp = s[i]
        const treeCp = tree[node] & TernaryStringSet.CP_MASK
        if (cp < treeCp) {
            return this.hasCodePoints(tree[node + 1], s, i)
        }
        if (cp > treeCp) {
            return this.hasCodePoints(tree[node + 3], s, i)
        }
        if (++i >= s.length) {
            return (tree[node] & TernaryStringSet.EOS) === TernaryStringSet.EOS ?
                node : -node - 1
        }
        return this.hasCodePoints(tree[node + 2], s, i)
    }

    protected traverse(n: number, d: number): void {
        if (n >= this._tree.length) {
            return
        }
        this._stats.breadth[d] = this._stats.breadth.length <= d ?
            1 :
            this._stats.breadth[d] + 1
        const cp: number = this._tree[n] & TernaryStringSet.CP_MASK
        if (cp >= TernaryStringSet.CP_MIN_SURROGATE) {
            this._stats.surrogates++
        }
        if (cp > this._stats.maxCodePoint) {
            this._stats.maxCodePoint = cp
        }
        if (cp < this._stats.minCodePoint) {
            this._stats.minCodePoint = cp
        }

        this.traverse(this._tree[n + 1], d + 1)
        this.traverse(this._tree[n + 2], d + 1)
        this.traverse(this._tree[n + 3], d + 1)
    }

    protected updateStats(): void {
        this._stats.breadth = []
        this._stats.nodes = this._tree.length / 4
        this._stats.surrogates = 0
        this._stats.minCodePoint = this._stats.nodes > 0 ? 0x10fff : 0
        this._stats.maxCodePoint = 0

        this.traverse(0, 0)
        this._stats.size = this._size
        this._stats.compact = this._compact
        this._stats.depth = this._stats.breadth.length
    }

    protected visitCodePoints(
        node: number,
        prefix: number[],
        visitFn: (prefix: number[], node: number) => void
    ) {
        const tree = this._tree
        if (node >= tree.length) {
            return
        }
        this.visitCodePoints(tree[node + 1], prefix, visitFn)
        prefix.push(tree[node] & TernaryStringSet.CP_MASK)
        if ((tree[node] & TernaryStringSet.EOS) === TernaryStringSet.EOS) {
            visitFn(prefix, node)
        }
        this.visitCodePoints(tree[node + 2], prefix, visitFn)
        prefix.pop()
        this.visitCodePoints(tree[node + 3], prefix, visitFn)
    }
}