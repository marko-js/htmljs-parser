exports.includeTextParserState = true;

exports.openTagHandlers = {
    'parsed-text': function(event) {
        this.enterParsedTextContentState();
    }
};