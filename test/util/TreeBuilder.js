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

    if (attr.default) {
      result += "DEFAULT";
    } else if (attr.name) {
      result += attr.name;
    }

    if (attr.argument) {
      result += "(" + attr.argument.value + ")";
    }

    result += attributeAssignmentToString(attr);
  }

  return result;
}

function attributeAssignmentToString(attr) {
  var result = "";

  if (attr.value) {
    if (attr.method) {
      result += " {" + attr.value + "}";
    } else if (attr.spread) {
      result += "...(" + attr.value + ")";
    } else {
      result += "=";

      if (attr.bound) {
        result += "BOUND(" + attr.value + ")";
      } else {
        result += "(" + attr.value + ")";
      }
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
        out.writeLine(line);
        break;
      }

      case "comment": {
        out.writeLine("comment:" + JSON.stringify(event.value));
        break;
      }

      case "cdata": {
        out.writeLine("cdata:" + JSON.stringify(event.value));
        break;
      }

      case "declaration": {
        out.writeLine("declaration:" + JSON.stringify(event.value));
        break;
      }

      case "documentType": {
        out.writeLine("documentType:" + JSON.stringify(event.value));
        break;
      }

      case "placeholder": {
        out.writeLine(
          (event.escape ? "${" : "$!{") + JSON.stringify(event.value) + "}"
        );
        break;
      }

      case "scriptlet": {
        if (event.line) {
          out.writeLine("scriptlet(line):" + JSON.stringify(event.value));
        } else if (event.block) {
          out.writeLine("scriptlet(block):" + JSON.stringify(event.value));
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

    if (event.code) {
      out.writeLine(event.code);
      return;
    }

    var tagName = event.tagName;
    var tagNameExpression = event.tagNameExpression;
    var argument = event.argument;
    var variable = event.var;
    var params = event.params;
    var attributes = event.attributes;
    var openTagOnly = event.openTagOnly === true;
    var selfClosed = event.selfClosed === true;

    var str = "<";

    if (tagNameExpression) {
      str += tagNameExpression;
    } else {
      str += tagName || "div";
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

    out.writeLine("</" + (/\${/.test(tagName) ? "" : tagName) + ">");
  }
}

class TreeBuilder {
  constructor(src) {
    this.src = src;

    this.root = new RootNode();
    this.stack = [this.root];

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
        event.value = escapeFunc + "(" + event.value + ")";
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

      onOpenTag: (event) => {
        var startPos = event.pos;
        var endPos = event.endPos;
        var tagName = event.tagName;

        if (!event.shorthandId && !event.shorthandClassNames) {
          // Make sure the position information is correct, but only if the
          // shorthand syntax was not used on the tag name
          if (event.concise) {
            expect(src.substring(startPos, startPos + tagName.length)).to.equal(
              tagName
            );
          } else {
            expect(
              src.substring(startPos, startPos + 1 + tagName.length)
            ).to.equal("<" + tagName);

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
      },

      onCloseTag: (event) => {
        var tagName = event.tagName;

        var last = this.stack.pop();

        if (!last) {
          throw new Error("Illegal state: unmatched close tag: " + tagName);
        }

        var lastEvent = last.event;

        if (last.event.tagName !== event.tagName) {
          // throw new Error('Illegal state: incorrectly close tag: ' + last.event.tagName + ' != ' + tagName);
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
        } else {
          if (!lastEvent.shorthandId && !lastEvent.shorthandClassNames) {
            var actualEndTag = src.substring(startPos, endPos);
            if (
              actualEndTag !== "</" + tagName + ">" &&
              actualEndTag !== "</>"
            ) {
              throw new Error(
                "Incorrect start/stop pos for close tag: " + actualEndTag
              );
            }
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
