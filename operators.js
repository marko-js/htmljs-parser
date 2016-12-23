var operators = exports.operators = [
    //Multiplicative Operators
    '*', '/', '%',

    //Additive Operators
    '+', '-',

    //Bitwise Shift Operators
    '<<', '>>', '>>>',

    //Relational Operators
    '<', '<=', '>', '>=',

    // Readable Operators
    // NOTE: These become reserved words and cannot be used as attribute names
    'instanceof',
    'in',
    // 'from', -- as in <import x from './file'/>
    // 'typeof', -- would need to look behind, not ahead

    // Equality Operators
    '==', '!=', '===', '!==',

    // Binary Bitwise Operators
    '&', '^', '|',

    // Binary Logical Operators
    '&&', '||',

    // Ternary Operator
    '?', ':',

    // Member
    '['
];

// Look for longest operators first
operators.sort(function(a, b) {
    return b.length - a.length;
});

var requiresWhitespace = exports.requiresWhitespace = {
    'instanceof':true,
    'in':true,
    'typeof':true
};

var escapedOperators = operators.map(o => {
    if(requiresWhitespace[o]) {
        return '\\s'+escapeNonAlphaNumeric(o)+'\\s';
    }
    if(o === '/') {
        return '\\/(?:\\b|\\s)'; //make sure this isn't a comment
    }
    return escapeNonAlphaNumeric(o);
});

exports.longest = operators.sort((a, b) => b.length-a.length)[0].length+1;
exports.patternNext = new RegExp('^\\s*('+escapedOperators.join('|')+')\\s*(?!-)');
exports.patternPrev = new RegExp('[^-+](?:'+escapedOperators.join('|')+')(\\s*)$');

function escapeNonAlphaNumeric(str) {
    return str.replace(/([^\w\d])/g, '\\$1');
}

