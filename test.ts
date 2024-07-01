// Tests moved to separate project.

let test: TernaryStringSet
let allPassed: boolean = true

// delete() empty string.
test = new TernaryStringSet()
test.add("")
test.add("horse")
if (test.size != 2) {
    game.splash("Delete test 1a failed.")
    allPassed = false
}
if (!test.has("")) {
    game.splash("Delete test 1b failed.")
    allPassed = false
}
test.delete("")
if (test.size != 1) {
    game.splash("Delete test 1c failed.")
    allPassed = false
}
if (test.has("")) {
    game.splash("Delete test 1d failed.")
    allPassed = false
}

// delete() non-member.
test = new TernaryStringSet()
if (test.size != 0) {
    game.splash("Delete test 2a failed.")
    allPassed = false
}
test.add("dog")
if (test.size != 1) {
    game.splash("Delete test 2b failed.")
    allPassed = false
}
if (test.has("cat")) {
    game.splash("Delete test 2c failed.")
    allPassed = false
}
if (test.delete("cat")) {
    game.splash("Delete test 2d failed.")
    allPassed = false
}
if (test.size != 1) {
    game.splash("Delete test 2e failed.")
    allPassed = false
}

if (allPassed) {
    game.splash("All tests passed!")
} else {
    game.splash("At least one test failed.")
}