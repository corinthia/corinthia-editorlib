// Copyright (c) 2011-2012 UX Productivity Pty Ltd. All rights reserved.

function arrayContains(array,value)
{
    for (var i = 0; i < array.length; i++) {
        if (array[i] == value)
            return true;
    }
    return false;
}

// Note: you can use slice() to copy a real javascript array, but this function can be used to copy
// DOM NodeLists (e.g. as returned by document.getElementsByTagName) as well, since they don't
// support the slice method
function arrayCopy(array)
{
    if (array == null)
        return null;
    var copy = new Array();
    for (var i = 0; i < array.length; i++)
        copy.push(array[i]);
    return copy;
}

function quoteString(str)
{
    if (str == null)
        return null;

    if (str.indexOf('"') < 0)
        return str;

    var quoted = "";
    for (var i = 0; i < str.length; i++) {
        if (str.charAt(i) == '"')
            quoted += "\\\"";
        else
            quoted += str.charAt(i);
    }
    return quoted;
}

function nodeString(node)
{
    if (node == null)
        return "null";
    var id = "";
    if (window.debugIds)
        id = node._nodeId.replace(/^.*:/,"")+":";
    if (node.nodeType == Node.TEXT_NODE)
        return id+JSON.stringify(node.nodeValue);
    else if ((node.nodeType == Node.ELEMENT_NODE) && (node.hasAttribute("id")))
        return id+DOM_upperName(node)+"#"+node.getAttribute("id");
    else
        return id+DOM_upperName(node);
}

function clone(object)
{
    var result = new Object();
    for (var name in object)
        result[name] = object[name];
    return result;
}

// This function works around a bug in WebKit where caretRangeFromPoint sometimes returns an
// incorrect node (the last text node in the document). In a previous attempt to fix this bug,
// we first checked if the point was in the elements bounding rect, but this meant that it wasn't
// possible to place the cursor at the nearest node, if the click location was not exactly on a
// node.

// Now we instead check to see if the result of elementFromPoint is the same as the parent node
// of the text node returned by caretRangeFromPoint. If it isn't, then we assume that the latter
// result is incorrect, and return null.

// In the circumstances where this bug was observed, the last text node in the document was being
// returned from caretRangeFromPoint in some cases. In the typical case, this is going to be inside
// a paragraph node, but elementNodeFromPoint was returning the body element. The check we do now
// comparing the results of the two functions fixes this case, but won't work as intended if the
// document's last text node is a direct child of the body (as it may be in some HTML documents
// that users open).

function positionAtPoint(x,y)
{
    // In general, we can use document.caretRangeFromPoint(x,y) to determine the location of the
    // cursor based on screen coordinates. However, this doesn't work if the screen coordinates
    // are outside the bounding box of the document's body. So when this is true, we find either
    // the first or last non-whitespace text node, calculate a y value that is half-way between
    // the top and bottom of its first or last rect (respectively), and then make a call to
    // caretRangeFromPoint with the same x value but this new y value. This results in the cursor
    // being placed on the first or last line when the user taps outside the document bounds.

    var bodyRect = document.body.getBoundingClientRect();
    var boundaryRect = null;
    if (y <= bodyRect.top)
        boundaryRect = findFirstTextRect();
    else if (y >= bodyRect.bottom) 
        boundaryRect = findLastTextRect();

    if (boundaryRect != null) {
        var boundaryY = boundaryRect.top + boundaryRect.height/2;
        var range = document.caretRangeFromPoint(x,boundaryY);
        if (range != null) {
            var position;
            if (range != null)
                position = new Position(range.startContainer,range.startOffset);
            else
                position = new Position(node,node.nodeValue.length);
            return position;
        }
    }

    // We get here if the coordinates are inside the document's bounding rect, or if getting the
    // position from the first or last rect failed for some reason.

    var range = document.caretRangeFromPoint(x,y);
    if (range == null)
        return null;

    var element = document.elementFromPoint(x,y);
    if ((range.startContainer.nodeType == Node.TEXT_NODE) &&
        (element != range.startContainer.parentNode)) {
        return null;
    }

    var position = new Position(range.startContainer,range.startOffset);
    return position;

    function findLastTextRect()
    {
        var node = lastDescendant(document.body);

        while ((node != null) && ((node.nodeType != Node.TEXT_NODE) || isWhitespaceTextNode(node)))
            node = prevNode(node);
        
        if (node != null) {
            var domRange = document.createRange();
            domRange.setStart(node,0);
            domRange.setEnd(node,node.nodeValue.length);
            var rects = domRange.getClientRects();
            if ((rects != null) && (rects.length > 0))
                return rects[rects.length-1];
        }
        return null;
    }

    function findFirstTextRect()
    {
        var node = firstDescendant(document.body);

        while ((node != null) && ((node.nodeType != Node.TEXT_NODE) || isWhitespaceTextNode(node)))
            node = nextNode(node);
        
        if (node != null) {
            var domRange = document.createRange();
            domRange.setStart(node,0);
            domRange.setEnd(node,node.nodeValue.length);
            var rects = domRange.getClientRects();
            if ((rects != null) && (rects.length > 0))
                return rects[0];
        }
        return null;
    }
}

function nodeHasContent(node)
{
    if (node.nodeType == Node.TEXT_NODE) {
        return !isWhitespaceString(node.nodeValue);
    }
    else if ((DOM_upperName(node) == "IMG") || (DOM_upperName(node) == "TABLE")) {
        return true;
    }
    else if (isOpaqueNode(node)) {
        return true;
    }
    else {
        for (var child = node.firstChild; child != null; child = child.nextSibling) {
            if (nodeHasContent(child))
                return true;
        }
        return false;
    }
}

function isWhitespaceString(str)
{
    return (str.match(isWhitespaceString.regexp) != null);
}

isWhitespaceString.regexp = /^\s*$/;

function normalizeWhitespace(str)
{
    str = str.replace(/^\s+/,"");
    str = str.replace(/\s+$/,"");
    str = str.replace(/\s+/g," ");
    return str;
}

function DoublyLinkedList()
{
    this.first = null;
    this.last = null;
}

DoublyLinkedList.prototype.insertAfter = function(item,after)
{
    item.prev = null;
    item.next = null;

    if (this.first == null) { // empty list
        this.first = item;
        this.last = item;
    }
    else if (after == null) { // insert at start
        item.next = this.first;
        this.first = item;
    }
    else {
        item.next = after.next;
        item.prev = after;
        if (this.last == after)
            this.last = item;
    }

    if (item.next != null)
        item.next.prev = item;
    if (item.prev != null)
        item.prev.next = item;
};

DoublyLinkedList.prototype.remove = function(item)
{
    if (this.first == item)
        this.first = this.first.next;
    if (this.last == item)
        this.last = this.last.prev;
    if (item.prev != null)
        item.prev.next = item.next;
    if (item.next != null)
        item.next.prev = item.prev;
    item.prev = null;
    item.next = null;
};
