exports.openTagNameHandlers = {
    static: function(event) {
        event.setParseOptions({
            ignoreAttributes: true
        });
    }
};