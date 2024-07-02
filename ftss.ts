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
     * Removes all strings from this set.
     */
    public clear(): void {
        this._tree = []
        this._hasEmpty = false
        this._compact = false
        this._size = 0
    }

    public decompact(): void {
        throw 'decompact(): Not yet implemented.'
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

    protected getStringFromCharArray(codes: number[]): string {
        let toReturn: string = ""
        for (let c of codes) {
            toReturn += String.fromCharCode(c)
        }
        return toReturn
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
}