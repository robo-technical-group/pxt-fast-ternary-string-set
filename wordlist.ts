namespace WordLists {
    //% fixedInstance
    export const EmptySet: TernaryStringSet = new TernaryStringSet()
    
    //% block
    export function getRandomWordFromSet(s: TernaryStringSet): string {
        return s.get(randint(0, s.size - 1))
    }

    //% block
    export function isWordInSet(s: TernaryStringSet, word: string): boolean {
        return s.has(word)
    }
}
