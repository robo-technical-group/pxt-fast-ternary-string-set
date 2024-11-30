namespace WordLists {
    //% fixedInstance
    //% block="Empty Set" weight=0
    export const zEmptySet: TernaryStringSet = new TernaryStringSet()
    
    //% block
    export function getRandomWordFromSet(s: TernaryStringSet): string {
        return s.get(randint(0, s.size - 1))
    }

    //% block="is word $word in set $s"
    export function isWordInSet(s: TernaryStringSet, word: string): boolean {
        return s.has(word)
    }

    //% block="number of words in set $s"
    export function wordCount(s: TernaryStringSet): number {
        return s.size
    }

    //% block="word set $s requires lower case?"
    export function forcesLowerCase(s: TernaryStringSet): boolean {
        return s.forceLower
    }

    //% block "word set $s requires upper case?"
    export function forcesUpperCase(s: TernaryStringSet): boolean {
        return s.forceUpper
    }
}
