exports.getSource = function() {
    return [
        'div class="foo"',
        '    span class="bar" - <strong>baz</strong>',
        '---',
        'Hello ${data.name}!',
        '---'
    ].join('\r\n');
};

exports.preserveLineEndings = true;