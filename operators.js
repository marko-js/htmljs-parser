var operators = exports.operators = [
    //Multiplicative Operators
    '*', '/', '%',

    //Additive Operators
    '+', '-',

    //Bitwise Shift Operators
    '<<', // ambiguous (close open tag): '>>', '>>>',

    //Relational Operators
    '<', '<=', // ambiguous (close open tag): '>', '>=',

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

var requiresWhitespace = exports.requiresWhitespace = {
    'instanceof':true,
    'in':true,
    'typeof':true
};

exports.pattern = new RegExp('^\\s*('+operators.map(o => {
    if(requiresWhitespace[o]) {
        return '\\s'+escapeNonAlphaNumeric(o)+'\\s';
    }
    if(o === '/') {
        return '\\/(?:\\b|\\s)'; //make sure this isn't a comment
    }
    return escapeNonAlphaNumeric(o);
}).join('|')+')\\s*');

function escapeNonAlphaNumeric(str) {
    return str.replace(/([^\w\d])/g, '\\$1');
}

