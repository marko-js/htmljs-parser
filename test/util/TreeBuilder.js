"use strict";
var expect = require("chai").expect;

function attributesToString(attributes) {
  var len = (attributes && attributes.length) || 0;
  if (!len) {
    return "";
  }

  var i = 0;
  var result = "";

  for (; i < len; i++) {
    var attr = attributes[i];
    result += " ";

    if (attr.name) {
      result += attr.default ? "DEFAULT" : attr.name.value;
    }

    if (attr.argument) {
      result += "(" + attr.argument.value + ")";
    }

    if (attr.spread) {
      result += "...";
    }

    result += attributeAssignmentToString(attr);
  }

  return result;
}

function attributeAssignmentToString(attr) {
  var result = "";

  if (attr.value) {
    if (attr.name) {
      result += attr.method ? " " : "=";
    }

    if (attr.bound) {
      result += "BOUND(" + attr.value.value + ")";
    } else if (attr.method) {
      result += "{" + attr.value.value + "}";
    } else {
      result += "(" + attr.value.value + ")";
    }
  } else if (!attr.argument) {
    result += "=(EMPTY)";
  }

  return result;
}

class RootNode {
  constructor() {
    this.children = [];
  }

  write(out) {
    this.children.forEach((child) => {
      child.write(out);
    });
  }
}

class Node {
  constructor(event) {
    this.event = event;
  }

  write(out) {
    var event = this.event;
    switch (event.type) {
      case "text": {
        var line = "text:" + JSON.stringify(event.value);
        if (out.includeTextParserState) {
          line += " [parseMode=" + event.parseMode + "]";
        }
        out.writeLine(line);
        break;
      }

      case "comment": {
        out.writeLine("comment:" + JSON.stringify(event.value));
        break;
      }

      case "cdata": {
        out.writeLine(
          "cdata:" +
            JSON.stringify(event.value) +
            (out.includePositions ? ":" + event.pos + "-" + event.endPos : "")
        );
        break;
      }

      case "declaration": {
        out.writeLine(
          "declaration:" +
            JSON.stringify(event.value) +
            (out.includePositions ? ":" + event.pos + "-" + event.endPos : "")
        );
        break;
      }

      case "documentType": {
        out.writeLine(
          "documentType:" +
            JSON.stringify(event.value) +
            (out.includePositions ? ":" + event.pos + "-" + event.endPos : "")
        );
        break;
      }

      case "placeholder": {
        out.writeLine(
          (event.escape ? "${" : "$!{") + JSON.stringify(event.value) + "}"
        );
        break;
      }

      case "scriptlet": {
        if (event.tag) {
          out.writeLine("scriptlet:" + JSON.stringify(event.value));
        } else if (event.block) {
          out.writeLine("scriptlet(block):" + JSON.stringify(event.value));
        } else {
          out.writeLine("scriptlet(line):" + JSON.stringify(event.value));
        }
        break;
      }

      case "error": {
        out.writeLine(
          "error:" +
            JSON.stringify(event.message) +
            " (code: " +
            JSON.stringify(event.code) +
            ")"
        );
        break;
      }

      default: {
        throw new Error("Not implemented: " + event.type);
      }
    }
  }
}

class ElementNode {
  constructor(event) {
    this.event = event;
    this.children = [];
  }

  write(out) {
    var event = this.event;
    var tagName = event.tagName;
    var argument = event.argument;
    var variable = event.var;
    var params = event.params;
    var attributes = event.attributes;
    var openTagOnly = event.openTagOnly;
    var selfClosed = event.selfClosed;

    var str = "<";

    if (tagName.expression) {
      str += "(" + tagName.expression.value + ")";
    } else {
      str += tagName.value || "div";
    }

    if (variable) {
      str += " VAR=(" + variable.value + ")";
    }

    if (argument) {
      str += " ARGS=(" + argument.value + ")";
    }

    if (params) {
      str += " PARAMS=(" + params.value + ")";
    }

    if (out.includePositions) {
      str += ":" + event.pos;
    }

    if (event.shorthandId) {
      str += " shorthandId=`" + event.shorthandId.value + "`";
    }

    if (event.shorthandClassNames) {
      str +=
        " shorthandClassNames=`" +
        event.shorthandClassNames.map((it) => it.value).join(" ") +
        "`";
    }

    str +=
      attributesToString(attributes) +
      (openTagOnly ? " OPEN_ONLY" : "") +
      (selfClosed ? " SELF_CLOSED" : "") +
      ">";
    out.writeLine(str);

    out.incIndent();
    this.children.forEach((child) => {
      child.write(out);
    });
    out.decIndent();

    out.writeLine(
      "</" + (/\${/.test(tagName.value) ? "" : tagName.value) + ">"
    );
  }
}

class TreeBuilder {
  constructor(src, options) {
    options = options || {};

    this.src = src;
    this.includePositions = options && options.includePositions === true;
    this.includeTextParserState = options.includeTextParserState === true;

    this.root = new RootNode();
    this.stack = [this.root];

    var openTagHandlers = options.openTagHandlers;
    var openTagNameHandlers = options.openTagNameHandlers;

    this.listeners = {
      onText: (event) => {
        this.last.children.push(new Node(event));
      },

      onPlaceholder: (event) => {
        var escape = event.escape;

        if (escape) {
          expect(src.substring(event.pos, event.pos + 2)).to.equal("${");
        } else {
          expect(src.substring(event.pos, event.pos + 3)).to.equal("$!{");
        }

        expect(src.substring(event.endPos - 1, event.endPos)).to.equal("}");

        var escapeFunc = escape ? "$escapeXml" : "$noEscapeXml";
        event.value = escapeFunc + "(" + event.value.value + ")";
        this.last.children.push(new Node(event));
      },

      onCDATA: (event) => {
        var startPos = event.pos;
        var endPos = event.endPos;

        // Make sure the position information is correct
        expect(src.substring(startPos, startPos + "<![CDATA[".length)).to.equal(
          "<![CDATA["
        );
        expect(src.substring(endPos - "]]>".length, endPos)).to.equal("]]>");

        this.last.children.push(new Node(event));
      },

      onOpenTagName: (event, parser) => {
        var tagName = event.tagName.value;
        var openTagNameHandler =
          openTagNameHandlers && openTagNameHandlers[tagName];
        if (openTagNameHandler) {
          openTagNameHandler.call(parser, event, parser);
        }
      },

      onOpenTag: (event, parser) => {
        var startPos = event.pos;
        var endPos = event.endPos;
        var tagName = event.tagName;

        if (
          !event.shorthandId &&
          !event.shorthandClassNames &&
          tagName.pos !== undefined
        ) {
          // Make sure the position information is correct, but only if the
          // shorthand syntax was not used on the tag name
          if (event.concise) {
            expect(src.substring(startPos, tagName.endPos)).to.equal(
              tagName.value
            );
          } else {
            expect(src.substring(startPos, tagName.endPos)).to.equal(
              "<" + tagName.value
            );

            if (event.selfClosed) {
              expect(src.substring(endPos - 2, endPos)).to.equal("/>");
            } else {
              expect(src.charAt(endPos - 1)).to.equal(">");
            }
          }
        }

        var el = new ElementNode(event);
        this.last.children.push(el);
        this.stack.push(el);

        var openTagHandler = openTagHandlers && openTagHandlers[tagName.value];
        if (openTagHandler) {
          openTagHandler.call(parser, event, parser);
        }
      },

      onCloseTag: (event) => {
        var tagName = event.tagName.value;

        var last = this.stack.pop();

        if (!last) {
          throw new Error("Illegal state: unmatched close tag: " + tagName);
        }

        var lastEvent = last.event;

        if (tagName && (last.event.tagName.value || "div") !== tagName) {
          if (
            // accepts including the tag class/id shorthands as part of the close tag name.
            tagName !==
            src.slice(
              lastEvent.tagName.pos,
              Math.max(
                lastEvent.shorthandId ? lastEvent.shorthandId.endPos : 0,
                lastEvent.shorthandClassNames
                  ? lastEvent.shorthandClassNames[
                      lastEvent.shorthandClassNames.length - 1
                    ].endPos
                  : 0
              )
            )
          ) {
            throw new Error(
              "Illegal state: incorrectly close tag: " +
                last.event.tagName.value +
                " != " +
                tagName
            );
          }
        }

        // Make sure the position information is correct
        var startPos = event.pos;
        var endPos = event.endPos;

        if (
          lastEvent.concise ||
          lastEvent.selfClosed ||
          lastEvent.openTagOnly
        ) {
          expect(startPos == null).to.equal(true);
          expect(endPos == null).to.equal(true);
        } else if (
          !lastEvent.tagName.shorthandId &&
          !lastEvent.tagName.shorthandClassNames &&
          startPos !== undefined
        ) {
          var actualEndTag = src.substring(startPos, endPos);

          if (actualEndTag !== "</" + tagName + ">" && actualEndTag !== "</>") {
            throw new Error(
              "Incorrect start/stop pos for close tag: " + actualEndTag
            );
          }
        }

        last.closeEvent = event;
      },

      onDocumentType: (event) => {
        expect(src.substring(event.pos, event.pos + 2)).to.equal("<!");
        expect(src.substring(event.endPos - 1, event.endPos)).to.equal(">");
        this.last.children.push(new Node(event));
      },

      onDeclaration: (event) => {
        expect(src.substring(event.pos, event.pos + 2)).to.equal("<?");
        expect(src.substring(event.endPos - 1, event.endPos)).to.equal(">");
        this.last.children.push(new Node(event));
      },

      onComment: (event) => {
        var prefix = src.substring(event.pos, event.pos + 2);
        if (prefix === "//") {
        } else if (prefix === "/*") {
          expect(src.substring(event.endPos - 2, event.endPos)).to.equal("*/");
        } else {
          expect(src.substring(event.pos, event.pos + 4)).to.equal("<!--");
          expect(src.substring(event.endPos - 3, event.endPos)).to.equal("-->");
        }

        this.last.children.push(new Node(event));
      },

      onScriptlet: (event) => {
        if (event.tag) {
          expect(src.substring(event.pos, event.pos + 2)).to.equal("<%");
          expect(src.substring(event.endPos - 2, event.endPos)).to.equal("%>");
        }
        this.last.children.push(new Node(event));
      },

      onError: (event) => {
        this.last.children.push(new Node(event));
      },
    };
  }

  get last() {
    return this.stack[this.stack.length - 1];
  }

  toString() {
    var indent = "";
    var buffer = "";
    var out = {
      includePositions: this.includePositions === true,
      includeTextParserState: this.includeTextParserState === true,
      incIndent() {
        indent += "    ";
      },
      decIndent() {
        indent = indent.substring(4);
      },
      writeLine(text) {
        buffer += indent + text + "\n";
      },
    };

    this.root.write(out);

    return buffer;
  }
}

module.exports = TreeBuilder;
