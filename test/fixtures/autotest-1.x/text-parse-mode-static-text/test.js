exports.includeTextParserState = true;

exports.openTagHandlers = {
    'static-text': function(event) {
        this.enterStaticTextContentState();
    }
};