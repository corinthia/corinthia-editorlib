// Copyright (c) 2011-2012 UX Productivity Pty Ltd. All rights reserved.

function Range(startNode,startOffset,endNode,endOffset)
{
    this.start = new Position(startNode,startOffset);
    this.end = new Position(endNode,endOffset);
}

Range.prototype.copy = function()
{
    return new Range(this.start.node,this.start.offset,
                     this.end.node,this.end.offset);
}

Range.prototype.isEmpty = function()
{
    return ((this.start.node == this.end.node) &&
            (this.start.offset == this.end.offset));
}

Range.prototype.toString = function()
{
    return this.start.toString() + " - " + this.end.toString();
}

Range.prototype.trackWhileExecuting = function(fun)
{
    Position.trackWhileExecuting([this.start,this.end],fun);
}

Range.prototype.selectWholeWords = function()
{
    if ((this.start.node.nodeType == Node.TEXT_NODE) &&
        (this.end.node.nodeType == Node.TEXT_NODE)) {
        if (this.isForwards()) {
            // this.start comes before this.end
            this.start.moveToStartOfWord();
            this.end.moveToEndOfWord();
        }
        else {
            // this.end comes before this.end
            this.start.moveToEndOfWord();
            this.end.moveToStartOfWord();
        }
    }
}

Range.prototype.expand = function()
{
    var doc = this.start.node.ownerDocument;
    while ((this.start.offset == 0) && (this.start.node != doc.body)) {
        var offset = getOffsetOfNodeInParent(this.start.node);
        this.start.node = this.start.node.parentNode;
        this.start.offset = offset;
    }

    while ((this.end.offset == maxNodeOffset(this.end.node)) && (this.end.node != doc.body)) {
        var offset = getOffsetOfNodeInParent(this.end.node);
        this.end.node = this.end.node.parentNode;
        this.end.offset = offset+1;
    }
}

Range.prototype.omitEmptyTextSelection = function()
{
    if (!this.start.moveBackwardIfAtStart())
        this.start.moveForwardIfAtEnd()
    if (!this.end.moveBackwardIfAtStart())
        this.end.moveForwardIfAtEnd()
}

Range.prototype.isForwards = function()
{
    var doc = this.start.node.ownerDocument;
    if ((this.start.node.parentNode == null) && (this.start.node != doc.documentElement))
        throw new Error("Range.isForwards "+this+": start node has been removed from document");
    if ((this.end.node.parentNode == null) && (this.end.node != doc.documentElement))
        throw new Error("Range.isForwards "+this+": end node has been removed from document");

    var start = this.start;
    var end = this.end;

    if ((start.node == end.node) && (start.node.nodeType == Node.TEXT_NODE))
        return (end.offset >= start.offset);

    var startParent = null;
    var startChild = null;
    var endParent = null;
    var endChild = null;

    if (end.node.nodeType == Node.ELEMENT_NODE) {
        endParent = end.node;
        endChild = end.node.childNodes[end.offset];
    }
    else {
        endParent = end.node.parentNode;
        endChild = end.node;
    }

    if (start.node.nodeType == Node.ELEMENT_NODE) {
        startParent = start.node;
        startChild = start.node.childNodes[start.offset];
    }
    else {
        startParent = start.node.parentNode;
        startChild = start.node;
        if (startChild == endChild)
            return false;
    }

    var startC = startChild;
    var startP = startParent;
    while (startP != null) {

        var endC = endChild;
        var endP = endParent;
        while (endP != null) {

            if (startP == endC)
                return false;

            if (startP == endP) {
                if (endC == null) // endC is last child, so startC must be endC or come before it
                    return true;
                for (var n = startC; n != null; n = n.nextSibling) {
                    if (n == endC)
                        return true;
                }
                return false;
            }

            endC = endP;
            endP = endP.parentNode;
        }

        startC = startP;
        startP = startP.parentNode;
    }
    throw new Error("Could not find common ancestor");
}

Range.prototype.getInlineNodes = function()
{
    var all = this.getAllNodes();
    var result = new Array();
    for (var i = 0; i < all.length; i++) {
        if (isInlineNode(all[i]))
            result.push(all[i]);
    }
    return result;
}

Range.prototype.getAllNodes = function()
{
    var result = new Array();
    var outermost = this.getOutermostNodes();
    for (var i = 0; i < outermost.length; i++)
        addRecursive(outermost[i]);
    return result;

    function addRecursive(node)
    {
        result.push(node);
        for (var child = node.firstChild; child != null; child = child.nextSibling)
            addRecursive(child);
    }
}

Range.prototype.ensureRangeValidHierarchy = function()
{
    var nodes = this.getAllNodes();
    
    var depths = new Array();
    for (var i = 0; i < nodes.length; i++) {
        var depth = getNodeDepth(nodes[i]);
        if (depths[depth] == null) {
            depths[depth] = new Array();
        }
        depths[depth].push(nodes[i]);
    }
    
    for (var depth = 0; depth < depths.length; depth++) {
        var firstDepth = true;
        if (depths[depth] != null) {
            for (var i = 0; i < depths[depth].length; i++) {
                var node = depths[depth][i];
                if (!isInlineNode(node.parentNode) && isWhitespaceTextNode(node)) {
                    node.parentNode.removeChild(node);
                }
                else {
                    ensureValidHierarchy(node,firstDepth);
                }
            }
            firstDepth = false;
        }
    }
}

Range.prototype.getOutermostNodes = function(info)
{
    if (!this.isForwards()) {
        var reverse = new Range(this.end.node,this.end.offset,this.start.node,this.start.offset);
        if (!reverse.isForwards())
            throw new Error("Both range "+this+" and its reverse are not forwards");
        return reverse.getOutermostNodes(info);
    }

    var start = this.start;
    var end = this.end;

    var beforeNodes = new Array();
    var middleNodes = new Array();
    var afterNodes = new Array();

    if (info != null) {
        info.beginning = beforeNodes;
        info.middle = middleNodes;
        info.end = afterNodes;
    }

    if ((start.node == end.node) && (start.offset == end.offset))
        return [];

    // Note: start and end are *points* - they are always *in between* nodes or characters, never
    // *at* a node or character.
    // Everything after the end point is excluded from the selection
    // Everything after the start point, but before the end point, is included in the selection

    // We use (parent,child) pairs so that we have a way to represent a point that comes after all
    // the child nodes in a container - in which case the child is null. The parent, however, is
    // always non-null;

    var startParent = null;
    var startChild = null;
    var endParent = null;
    var endChild = null;

    if (start.node.nodeType == Node.ELEMENT_NODE) {
        startParent = start.node;
        startChild = start.node.childNodes[start.offset];
    }
    else if ((start.node.nodeValue.length > 0) && (start.offset == start.node.nodeValue.length)) {
        startParent = start.node.parentNode;
        startChild = start.node.nextSibling;
    }
    else {
        startParent = start.node.parentNode;
        startChild = start.node;
    }

    if (end.node.nodeType == Node.ELEMENT_NODE) {
        endParent = end.node;
        endChild = end.node.childNodes[end.offset];
    }
    else if (end.offset == 0) {
        endParent = end.node.parentNode;
        endChild = end.node;
    }
    else {
        endParent = end.node.parentNode;
        endChild = end.node.nextSibling;
    }

    var ancestors = ancestorsWithCommonParent(startParent,startChild,endParent,endChild);
    if (ancestors == null)
        return [];
    var commonParent = ancestors.commonParent;
    var startAncestorChild = ancestors.startChild;
    var endAncestorChild = ancestors.endChild;

    // Add start nodes
    var topParent = startParent;
    var topChild = startChild;
    while (topParent != commonParent) {
        if (topChild != null)
            beforeNodes.push(topChild);

        while (((topChild == null) || (topChild.nextSibling == null)) &&
               (topParent != commonParent)) {
            topChild = topParent;
            topParent = topParent.parentNode;
        }
        if (topParent != commonParent)
            topChild = topChild.nextSibling;
    }

    // Add middle nodes
    if (startAncestorChild != endAncestorChild) {
        var c = startAncestorChild;
        if ((c != null) && (c != startChild))
            c = c.nextSibling;
        for (; c != endAncestorChild; c = c.nextSibling)
            middleNodes.push(c);
    }

    // Add end nodes
    var bottomParent = endParent;
    var bottomChild = endChild;
    while (true) {

        while ((getPreviousSibling(bottomParent,bottomChild) == null) &&
               (bottomParent != commonParent)) {
            bottomChild = bottomParent;
            bottomParent = bottomParent.parentNode;
        }
        if (bottomParent != commonParent)
            bottomChild = getPreviousSibling(bottomParent,bottomChild);

        if (bottomParent == commonParent)
            break;

        afterNodes.push(bottomChild);
    }
    afterNodes = afterNodes.reverse();

    var result = new Array();

    Array.prototype.push.apply(result,beforeNodes);
    Array.prototype.push.apply(result,middleNodes);
    Array.prototype.push.apply(result,afterNodes);

    return result;

    function ancestorsWithCommonParent(startParent,startChild,endParent,endChild)
    {
        var startP = startParent;
        var startC = startChild;
        while (startP != null) {
            var endP = endParent;
            var endC = endChild
            while (endP != null) {
                if (startP == endP) {
                    return { commonParent: startP, startChild: startC, endChild: endC };
                }
                endC = endP;
                endP = endP.parentNode;
            }
            startC = startP;
            startP = startP.parentNode;
        }
        return null;
    }

    function getPreviousSibling(parent,child)
    {
        if (child != null)
            return child.previousSibling;
        else if (parent.lastChild != null)
            return parent.lastChild;
        else
            return null;
    }

    function isAncestorLocation(ancestorParent,ancestorChild,
                                descendantParent,descendantChild)
    {
        while ((descendantParent != null) &&
               ((descendantParent != ancestorParent) || (descendantChild != ancestorChild))) {
            descendantChild = descendantParent;
            descendantParent = descendantParent.parentNode;
        }

        return ((descendantParent == ancestorParent) &&
                (descendantChild == ancestorChild));
    }
}

Range.prototype.getClientRects = function()
{
    var nodes = this.getOutermostNodes();

    // WebKit in iOS 5.0 has a bug where if the selection spans multiple paragraphs, the complete
    // rect for paragraphs other than the first is returned, instead of just the portions of it
    // that are actually in the range. To get around this problem, we go through each text node
    // individually and collect all the rects.
    var result = new Array();
    var doc = this.start.node.ownerDocument;
    var domRange = doc.createRange();
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        var node = nodes[nodeIndex];
        if (node.nodeType == Node.TEXT_NODE) {
            var startOffset = (node == this.start.node) ? this.start.offset : 0;
            var endOffset = (node == this.end.node) ? this.end.offset : node.nodeValue.length;
            domRange.setStart(node,startOffset);
            domRange.setEnd(node,endOffset);
            var rects = domRange.getClientRects();
            for (var rectIndex = 0; rectIndex < rects.length; rectIndex++)
                result.push(rects[rectIndex]);
        }
        else if (node.nodeType == Node.ELEMENT_NODE) {
            result.push(node.getBoundingClientRect());
        }
    }
    return result;
}
