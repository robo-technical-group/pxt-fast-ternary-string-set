/**
 * Simple tests
 * Create full test suite once something like Jest has been implemented.
 */
let allPassed: boolean = true
let test: TernaryStringSet

// Constructor
test = new TernaryStringSet()
if (test.size != 0) {
    game.splash("Test 1 failed.")
    allPassed = false
}

test = new TernaryStringSet([])
if (test.size != 0) {
    game.splash("Test 2 failed.")
    allPassed = false
}

// Test add empty string
test = new TernaryStringSet()
test.add("")
if (test.size != 1) {
    game.splash("Test 3a failed.")
    allPassed = false
}
if (!test.has("")) {
    game.splash("Test 3b failed.")
    allPassed = false
}
if (test.has("c")) {
    game.splash("Test 3c failed.")
    allPassed = false
}

// Add length 1 string.
test = new TernaryStringSet()
test.add("a")
if (!test.has("a")) {
    game.splash("Test 4a failed.")
    allPassed = false
}
for (let t of ["", "c", "aa"]) {
    if (test.has(t)) {
        game.splash(`Test 4b (${t}) failed.`)
        allPassed = false
    }
}

// Add singleton.
test = new TernaryStringSet()
test.add("cat")
if (test.size != 1) {
    game.splash("Test 5a failed.")
    allPassed = false
}
if (!test.has("cat")) {
    game.splash("Test 5b failed.")
    allPassed = false
}
for (let t of ["", "c", "cc", "ca", "caa", "cats"]) {
    if (test.has(t)) {
        game.splash(`Test 5c (${t}) failed.`)
        allPassed = false
    }
}

// Multiple words
test = new TernaryStringSet()
const words = [
    "moose",
    "dolphin",
    "caribou",
    "emu",
    "snake",
    "zebra",
    "narwhal",
]
words.forEach((s) => {
    test.add(s)
    if (!test.has(s)) {
        game.splash(`Test 6a (${s}) failed.`)
        allPassed = false
    }
})
words.forEach((s) => {
    if (!test.has(s)) {
        game.splash(`Test 6b (${s}) failed.`)
        allPassed = false
    }
})
if (test.size != words.length) {
    game.splash("Test 6c failed.")
    allPassed = false
}

function addAll(testName: string, args: string[]): void {
    test = new TernaryStringSet()
    test.addAll(args)
    if (test.size != args.length) {
        game.splash(`Size test ${testName} failed.`)
        allPassed = false
    }
    args.forEach((s) => {
        if (!test.has(s)) {
            game.splash(`Search test ${testName} for ${s} failed.`)
            allPassed = false
        }
    })
}

for (let t of [[], ["ape",], ["ape", "cat",], ["ape", "cat", "eel",]]) {
    addAll(`Test 7 with length ${t.length}`, t)
}

// addAll with duplicate words yields the correct size.
test = new TernaryStringSet()
test.addAll([
    "antelope",
    "crab",
    "porcupine",
    "crab",
    "crab",
    "crab",
    "antelope",
    "porcupine",
])
if (test.size != 3) {
    game.splash("Test 8 failed.")
    allPassed = false
}

// Show summary.
if (allPassed) {
    game.splash("All tests passed!")
} else {
    game.splash("At least one test failed.")
}