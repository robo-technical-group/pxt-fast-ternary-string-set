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

// addAll with complex strings.
test = new TernaryStringSet()
test.addAll([
    "Mt. Doom",
    "a dog—smelly",
    "line 1\nline2",
    "🙂",
    "I have a pet 🐈",
    "good 🍀 luck!",
    "程序设计员在用电脑。",
    "𝄞𝅘𝅥𝅘𝅥𝅮𝅘𝅥𝅯𝅘𝅥𝅰𝄽",
    "The \0 NUL Zone",
    "max code point \udbff\udfff",
])
if (test.size == 0) {
    game.splash("Test 9a failed.")
    allPassed = false
}
if (test.size != 10) {
    game.splash("Test 9b failed.")
    allPassed = false
}

// addAll tests with ranges.
test = new TernaryStringSet()
test.addAll([])
if (test.size != 0) {
    game.splash("Test 10a failed.")
    allPassed = false
}
test.addAll(["mongoose",])
if (test.size != 1) {
    game.splash("Test 10b failed.")
    allPassed = false
}
test.addAll(["badger", "pelican",], 0, 2)
if (test.size != 3) {
    game.splash("Test 10c failed.")
    allPassed = false
}
test.addAll(["asp", "mouse", "oyster",], 1, 3)
if (test.size != 5) {
    game.splash("Test 10d failed.")
    allPassed = false
}
if (test.has("asp")) {
    game.splash("Test 10e failed.")
    allPassed = false
}
test.addAll(["barracuda", "cricket", "panda", "tiger",], 0, 2)
if (test.size != 7) {
    game.splash("Test 10f failed.")
    allPassed = false
}
if (!test.has("barracuda") || !test.has("cricket")) {
    game.splash("Test 10g failed.")
    allPassed = false
}
if (test.has("panda") || test.has("tiger")) {
    game.splash("Test 10h failed.")
    allPassed = false
}
test.addAll(["bison", "caribou", "deer", "elk", "moose",], 1)
if (test.size != 11) {
    game.splash("Test 10i failed.")
    allPassed = false
}
if (test.has("bison")) {
    game.splash("Test 10j failed.")
    allPassed = false
}
if (!test.has("caribou") || !test.has("moose")) {
    game.splash("Test 10k failed.")
    allPassed = false
}

// addAll() with bad indices.
test = new TernaryStringSet()
try {
    test.addAll(["badger",], -1)
    game.splash("Test 11a failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["asp",], 0.5)
    game.splash("Test 11b failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["pig",], NaN)
    game.splash("Test 11c failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["hare",], 2)
    game.splash("Test 11d failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["ox",], 0, -1)
    game.splash("Test 11e failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["wolf",], 0, 0.5)
    game.splash("Test 11f failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["spider",], 0, NaN)
    game.splash("Test 11g failed.")
    allPassed = false
} catch {

}
try {
    test.addAll(["carp",], 0, 2)
    game.splash("Test 11h failed.")
    allPassed = false
} catch {

}

// Show summary.
if (allPassed) {
    game.splash("All tests passed!")
} else {
    game.splash("At least one test failed.")
}