/**
 * Render the object as YAML front-matter (suitable for passing on to Jekyll,
 * etc.)
 */
module.exports.frontmatter = function (data) {
    var matter = data.reduce(function (obj, composite) {
        Object.keys(obj).forEach(function (key) {
            composite[key] = obj[key];
        });

        return composite;
    }, {});

    return '---\n' + JSON.stringify(matter) + '\n---';
};
