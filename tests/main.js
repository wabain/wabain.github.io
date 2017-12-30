const tests = require.context(__dirname, true, /\.test\.js$/)

tests.keys().forEach((test) => {
    tests(test)
})
