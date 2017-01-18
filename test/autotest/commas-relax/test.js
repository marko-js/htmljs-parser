exports.openTagNameHandlers = {
    import: function(event) {
        event.setParseOptions({
            relaxRequireCommas: true
        });
    }
};