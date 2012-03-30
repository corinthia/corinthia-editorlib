function insertAtPosition(position,node)
{
    if (position.node.nodeType == Node.ELEMENT_NODE) {
        if (position.offset == position.node.childNodes.length)
            DOM.appendChild(position.node,node);
        else
            DOM.insertBefore(position.node,node,position.node.childNodes[position.offset]);
    }
    else if (position.node.nodeType == Node.TEXT_NODE) {
        var newText = DOM.createTextNode(document,position.node.nodeValue.slice(position.offset));
        position.node.nodeValue = position.node.nodeValue.slice(0,position.offset);
        DOM.insertBefore(position.node.parentNode,newText,position.node.nextSibling);
        DOM.insertBefore(position.node.parentNode,node,position.node.nextSibling);
    }
}

function insertTextAtPosition(position,str,inText)
{
    if (inText && (position.node.nodeType == Node.ELEMENT_NODE)) {
        var before = position.node.childNodes[position.offset-1];
        var after = position.node.childNodes[position.offset];
        if ((after != null) && (after.nodeType == Node.TEXT_NODE))
            position = new Position(after,0);
        else if ((before != null) && (before.nodeType == Node.TEXT_NODE))
            position = new Position(before,before.nodeValue.length);
    }
    if (position.node.nodeType == Node.ELEMENT_NODE) {
        insertAtPosition(position,DOM.createTextNode(document,str));
    }
    else if (position.node.nodeType == Node.TEXT_NODE) {
        position.node.nodeValue = position.node.nodeValue.slice(0,position.offset) + str +
                                  position.node.nodeValue.slice(position.offset);
    }
}

function showRangeAsBrackets(range,inText)
{
    insertTextAtPosition(range.end,"]",inText);
    insertTextAtPosition(range.start,"[",inText);
}

function removeIds()
{
    recurse(document.body);

    function recurse(node)
    {
        if (node.nodeType == Node.ELEMENT_NODE) {
            node.removeAttribute("id");
            for (var child = node.firstChild; child != null; child = child.nextSibling)
                recurse(child);
        }
    }
}

function selectNode(node)
{
    var offset = DOM.nodeOffset(node);
    Selection.setSelectionRange(new Range(node.parentNode,offset,node.parentNode,offset+1));
}

function removeWhitespaceAndCommentNodes(node)
{
    if (isWhitespaceTextNode(node) || (node.nodeType == Node.COMMENT_NODE)) {
        DOM.deleteNode(node);
    }
    else {
        var next;
        for (var child = node.firstChild; child != null; child = next) {
            next = child.nextSibling;
            removeWhitespaceAndCommentNodes(child);
        }
    }
}

// selectionWrapElement() and selectionUnwrapElement() used to be in formatting.js but have
// now been made obselete by the addition of applyFormattingChanges(). However there are still
// a few tests which use them.
function selectionWrapElement(elementName)
{
    if (elementName == "B")
        Formatting.applyFormattingChanges(null,{"font-weight": "bold"});
    else if (elementName == "I")
        Formatting.applyFormattingChanges(null,{"font-style": "italic"});
    else if (elementName == "U")
        Formatting.applyFormattingChanges(null,{"text-decoration": "underline"});
}

function selectionUnwrapElement(elementName)
{
    if (elementName == "B")
        Formatting.applyFormattingChanges(null,{"font-weight": null});
    else if (elementName == "I")
        Formatting.applyFormattingChanges(null,{"font-style": null});
    else if (elementName == "U")
        Formatting.applyFormattingChanges(null,{"text-decoration": null});
}

function showEmptyTextNodes()
{
    recurse(document);

    function recurse(node)
    {
        if ((node.nodeType == Node.TEXT_NODE) && (node.nodeValue.length == 0))
            node.nodeValue = "*";
        for (var child = node.firstChild; child != null; child = child.nextSibling)
            recurse(child);
    }
}

function showClipboard(clipboard)
{
    var html = clipboard["text/html"];
    var text = clipboard["text/plain"];

    if ((html.length == 0) || (html.charAt(html.length-1) != "\n"))
        html += "\n";
    if ((text.length == 0) || (text.charAt(text.length-1) != "\n"))
        text += "\n";

    return "text/html\n"+
           "---------\n"+
           "\n"+
           html+
           "\n"+
           "text/plain\n"+
           "----------\n"+
           "\n"+
           text;
}
