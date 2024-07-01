/*!
   Fast Ternary String Set
   https://github.com/CGJennings/fast-ternary-string-set

   Copyright © 2023 by Christopher Jennings.
   Licensed under an MIT license (see link above for details).
!*/
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
    private _tree: number[];
    /** Tracks whether empty string is in the set as a special case. */
    private _hasEmpty: boolean;
    /** Tracks whether this tree has been compacted; if true this must be undone before mutating the tree. */
    private _compact: boolean;
    /** Tracks set size. */
    private _size: number;

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
}