exports.openTagHandlers = {
    html: function(event) {
        this.enterHtmlContentState();
    },

    javascript: function(event) {
        this.enterJsContentState();
    },

    css: function(event) {
        this.enterCssContentState();
    },

    text: function(event) {
        this.enterStaticTextContentState();
    },

    parsedtext: function(event) {
        this.enterParsedTextContentState();
    }
};