exports.isOpenTagOnly = function(tagName) {
    if (tagName === 'bar-img') {
        return true;
    } else if (tagName === 'link') {
        return false;
    } else {
        return undefined;
    }
};