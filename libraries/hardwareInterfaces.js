﻿/**
 *   Created by Carsten on 12/06/2015.
 *   Modified by Valentin Heun on 16/08/16.
 **
 *   Copyright (c) 2015 Carsten Strunk
 *
 *   This Source Code Form is subject to the terms of the Mozilla Public
 *   License, v. 2.0. If a copy of the MPL was not distributed with this
 *   file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Reality Objects Hardware Interface API
 *
 * This API is intended for users who want to create their own hardware interfaces.
 * To create a new hardware interface create a folder under hardwareInterfaces and create the file index.js.
 * You should take a look at /hardwareInterfaces/emptyExample/index.js to get started.
 */

var path = require('path');
var fs = require('fs');
var utilities = require('./utilities');
const Node = require('../models/Node.js');
const Frame = require('../models/Frame.js');
const ObjectModel = require('../models/ObjectModel.js');

//global variables, passed through from server.js
var objects = {};
var objectLookup;
var knownObjects; // needed to check if sockets are still used when we delete links
var socketArray; // needed to delete sockets when links are removed
var globalVariables;
var dirnameO;
var objectsPath;
var nodeTypeModules;
// eslint-disable-next-line no-unused-vars
var blockModules;
var services;
var version;
var protocol;
var serverPort;
var callback;
var actionCallback;
var publicDataCallBack;
var writeObjectCallback;
var hardwareObjects = {};
var callBacks = new ObjectCallbacks();
var screenObjectCallBacks = {};
var frameAddedCallbacks = [];
var resetCallbacks = [];
var matrixStreamCallbacks = [];
var udpMessageCallbacks = [];
var interfaceSettingsCallbacks = {};
var screenPortMap = {};
var _this = this;

//data structures to manage the IO points generated by the API user
function ObjectCallbacks() {
    this.resetCallBacks = [];
    this.shutdownCallBacks = [];
    this.initializeCallBacks = [];
}

function EmptyObject(objectName) {
    this.name = objectName;
    this.frames = {};
}

function EmptyFrame(frameName) {
    this.name = frameName;
    this.nodes = {};
}

function EmptyNode(nodeName, type) {
    this.name = nodeName;
    this.type = type;
    this.callBack = {};
}

/*
 ********** API FUNCTIONS *********
 */

/**
 * This function writes the values passed from the hardware interface to the
 * Spatial Toolbox server.
 * @param {string} objectName The name of the RealityInterface
 * @param {string} nodeName The name of the IO point
 * @param {value} value The value to be passed on
 * @param {string} mode specifies the datatype of value, you can define it to be whatever you want. For example 'f' could mean value is a floating point variable.
 **/
exports.write = function (object, tool, node, value, mode, unit, unitMin, unitMax) {

    if (typeof mode === 'undefined') mode = 'f';
    if (typeof unit === 'undefined') unit = false;
    if (typeof unitMin === 'undefined') unitMin = 0;
    if (typeof unitMax === 'undefined') unitMax = 1;

    var objectKey = utilities.readObject(objectLookup, object); //get globally unique object id
    //  var valueKey = nodeName + objKey2;

    var nodeUuid = objectKey + tool + node;
    var frameUuid = objectKey + tool;

    if (objects.hasOwnProperty(objectKey)) {
        if (objects[objectKey].frames.hasOwnProperty(frameUuid)) {
            if (objects[objectKey].frames[frameUuid].nodes.hasOwnProperty(nodeUuid)) {
                var thisData = objects[objectKey].frames[frameUuid].nodes[nodeUuid].data;
                thisData.value = value;
                thisData.mode = mode;
                thisData.unit = unit;
                thisData.unitMin = unitMin;
                thisData.unitMax = unitMax;
                //callback is objectEngine in server.js. Notify data has changed.
                callback(objectKey, frameUuid, nodeUuid, thisData, objects, nodeTypeModules);
            }
        }
    }
};

exports.writePublicData = function (object, tool, node, dataObject, data) {
    var objectKey = utilities.readObject(objectLookup, object); //get globally unique object id
    var nodeUuid = objectKey + tool + node;
    var frameUuid = objectKey + tool;

    if (objects.hasOwnProperty(objectKey)) {
        if (objects[objectKey].frames.hasOwnProperty(frameUuid)) {
            if (objects[objectKey].frames[frameUuid].nodes.hasOwnProperty(nodeUuid)) {
                var thisData = objects[objectKey].frames[frameUuid].nodes[nodeUuid].publicData;
                thisData[dataObject] = data;
                //callback is objectEngine in server.js. Notify data has changed.
                publicDataCallBack(objectKey, frameUuid, nodeUuid);
            }
        }
    }
};

/**
 * @desc clearIO() removes IO points which are no longer needed. It should be called in your hardware interface after all addIO() calls have finished.
 * @param {string} type The name of your hardware interface (i.e. what you put in the type parameter of addIO())
 **/
exports.clearObject = function (objectUuid, toolUuid) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(objectUuid, objectsPath);
    if (objectID) {
        for (var key in objects[objectID].frames[objectID].nodes) {
            if (!hardwareObjects[objectUuid].nodes.hasOwnProperty(key)) {
                console.log('Deleting: ' + objectID + '   ' + objectID + '   ' + key);
                try {
                    objects[objectID].frames[toolUuid].nodes[key].deconstruct();
                } catch (e) {
                    console.warn('Node exists without proper prototype: ' + key);
                }
                delete objects[objectID].frames[toolUuid].nodes[key];
            }
        }
    }
    //TODO: clear links too
    console.log('object is all cleared');
};

exports.removeAllNodes = function (object, tool) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                for (var nodeKey in objects[objectID].frames[frameID].nodes) {
                    deleteLinksToAndFromNode(objectID, frameID, nodeKey);
                    if (!objects[objectID].frames[frameID].nodes.hasOwnProperty(nodeKey)) continue;
                    try {
                        objects[objectID].frames[frameID].nodes[nodeKey].deconstruct();
                    } catch (e) {
                        console.warn('Node exists without proper prototype: ' + nodeKey);
                    }
                    delete objects[objectID].frames[frameID].nodes[nodeKey];
                }
            }
        }
    }
};

// delete links to and from the node, including deleting the socket if it isn't used anymore
var deleteLinksToAndFromNode = function (objectUuid, toolUuid, nodeUuid) {

    // loop over all nodes in all frames in all objects to see if they need to be deleted
    for (var otherObjectKey in objects) {
        for (var otherFrameKey in objects[otherObjectKey].frames) {
            var thatFrameLinks = objects[otherObjectKey].frames[otherFrameKey].links;
            for (var linkKey in thatFrameLinks) {

                var thatLink = thatFrameLinks[linkKey];
                var destinationIp = knownObjects[thatLink.objectB];

                if ((thatLink.objectA === objectUuid && thatLink.frameA === toolUuid && thatLink.nodeA === nodeUuid) ||
                    (thatLink.objectB === objectUuid && thatLink.frameB === toolUuid && thatLink.nodeB === nodeUuid)) {

                    // this link includes the node that we are deleting, delete the link too
                    delete thatFrameLinks[linkKey];

                    // iterate over all frames in all objects to see if the destinationIp is still used by another link after this was deleted

                    var checkIfIpIsUsed = false;
                    for (var otherOtherObjectKey in objects) {
                        for (var otherOtherFrameKey in objects[otherOtherObjectKey].frames) {
                            var otherFrameLinks = objects[otherOtherObjectKey].frames[otherOtherFrameKey].links;
                            for (var otherLinkKey in otherFrameLinks) {
                                var otherLink = otherFrameLinks[otherLinkKey];
                                if (otherLink.objectB === thatLink.objectB) {
                                    checkIfIpIsUsed = true;
                                }
                            }
                        }
                    }

                    // if the destinationIp isn't linked to at all anymore, delete the websocket to that server
                    if (thatLink.objectB !== thatLink.objectA && !checkIfIpIsUsed) {
                        delete socketArray[destinationIp];
                    }

                    // maybe notify the clients to reload?? but might be unnecessary / redundant
                }
            }
        }
    }

};

exports.reloadNodeUI = function (object) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    actionCallback({reloadObject: {object: objectID}});
    writeObjectCallback(objectID);
};

exports.getAllObjects = function () {
    return objects;
};

exports.getKnownObjects = function () {
    return knownObjects;
};


var getAllTools_ = function (object) {
    var objectID = utilities.readObject(objectLookup, object);

    // lookup object properties using name
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            var tools = objects[objectID].frames;
            return tools;
        }
    }

    return {};
};

exports.getAllTools = getAllTools_;
exports.getAllFrames = getAllTools_;

exports.getAllNodes = function (object, tool) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;

    // lookup object properties using name
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                // get all of its nodes
                var nodes = objects[objectID].frames[frameID].nodes;
                // return node list
                return nodes;
            }
        }
    }

    return {};
};

exports.getAllLinksToNodes = function (object, tool) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;

    // lookup object properties using name
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                // get all of its nodes
                var links = objects[objectID].frames[frameID].links;
                // return node list
                return links; // TODO: this isn't complete. need to search for links in all objects that have this destination
            }
        }
    }

    return {};
};


var subscribeToNewToolsAdded_ = function (object, callback) {
    var objectID = utilities.readObject(objectLookup, object);

    frameAddedCallbacks.push({
        objectID: objectID,
        callback: callback
    });
};

exports.subscribeToNewToolsAdded = subscribeToNewToolsAdded_;
exports.subscribeToNewFramesAdded = subscribeToNewToolsAdded_;

exports.runToolAddedCallbacks = function (objectUuid, thisTool) {
    frameAddedCallbacks.forEach(function (callbackObject) {
        if (callbackObject.objectID === objectUuid) {
            callbackObject.callback(thisTool);
        }
    });
};

var runFrameAddedCallbacks_ = function (objectUuid, thisTool) {
    frameAddedCallbacks.forEach(function (callbackObject) {
        if (callbackObject.objectID === objectUuid) {
            callbackObject.callback(thisTool);
        }
    });
};

exports.runFrameAddedCallbacks = runFrameAddedCallbacks_;
exports.runToolAddedCallbacks = runFrameAddedCallbacks_;

exports.subscribeToReset = function (object, callback) {
    var objectID = utilities.readObject(objectLookup, object);

    resetCallbacks.push({
        objectID: objectID,
        callback: callback
    });
};

exports.runResetCallbacks = function (objectUuid) {
    resetCallbacks.forEach(function (callbackObject) {
        if (callbackObject.objectID === objectUuid) {
            callbackObject.callback();
        }
    });
};

exports.subscribeToMatrixStream = function (callback) {
    matrixStreamCallbacks.push(callback);
};

exports.triggerMatrixCallbacks = function (visibleObjects) {
    matrixStreamCallbacks.forEach(function (callback) {
        callback(visibleObjects);
    });
};

exports.subscribeToUDPMessages = function (callback) {
    udpMessageCallbacks.push(callback);
};

exports.triggerUDPCallbacks = function (msgContent) {
    udpMessageCallbacks.forEach(function (callback) {
        callback(msgContent);
    });
};

exports.clearTool = function (object, tool) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    console.log('remove set tool');

    var frameUuid = objectID + tool;

    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameUuid)) {
                if (objects[objectID].frames[frameUuid].hasOwnProperty('tool')) {
                    delete objects[objectID].frames[frameUuid].tool;
                }
            }
        }
    }
};

exports.setTool = function (object, tool, newTool, dirName) {

    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    console.log('set new tool: ', newTool);

    var frameUuid = objectID + tool;

    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {

            if (dirName) {

                var addonName = '';
                var interfaceName = '';

                var dirArray = dirName.split('/');
                var dirLength = dirArray.length;

                if (dirArray[dirLength - 2] === 'interfaces') {
                    addonName = dirArray[dirLength - 3];
                    interfaceName = dirArray[dirLength - 1];
                } else {
                    dirArray = dirName.split('\\');
                    dirLength = dirArray.length;

                    if (dirArray[dirLength - 2] === 'interfaces') {
                        addonName = dirArray[dirLength - 3];
                        interfaceName = dirArray[dirLength - 1];

                    }
                }
                if (!objects[objectID].frames.hasOwnProperty(frameUuid)) {
                    objects[objectID].frames[frameUuid] = new Frame(objectID, frameUuid);
                }
                //define the tool that is used with this frame
                objects[objectID].frames[frameUuid].tool = {addon: addonName, interface: interfaceName, tool: newTool};
            }
        }
    }
};

/**
 * @desc addIO() a new IO point to the specified RealityInterface
 * @param {string} objectName The name of the RealityInterface
 *  * @param {string} frameName The name of the RealityInterface frame
 * @param {string} nodeName The name of the nodeName
 * @param {string} type The name of the data conversion type. If you don't have your own put in "default".
 * @param {object} position - an optional {x: float, y: float} object for the node's starting position. otherwise random
 **/

exports.addNode = function (object, tool, node, type, position) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    console.log('hardwareInterfaces.addNode objectID: ', objectID, object, objectsPath);

    if (!objectID) {
        console.log('Creating new object for hardware node', object);

        var folder = path.join(objectsPath, object);
        var identityPath = path.join(folder, '.identity');
        var jsonFilePath = path.join(identityPath, 'object.json');
        objectID = object + utilities.uuidTime();

        utilities.createFolder(object, objectsPath, globalVariables.debug);

        // create a new anchor object
        objects[objectID] = new ObjectModel(services.ip, version, protocol, objectID);
        objects[objectID].port = serverPort;
        objects[objectID].name = object;
        objects[objectID].isAnchor = true;
        objects[objectID].matrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
        objects[objectID].tcs = 0;

        if (globalVariables.saveToDisk) {
            fs.writeFileSync(jsonFilePath, JSON.stringify(objects[objectID], null, 4), function (err) {
                if (err) {
                    console.log('anchor object save error', err);
                } else {
                    // console.log('JSON saved to ' + jsonFilePath);
                }
            });
        } else {
            console.log('I am not allowed to save');
        }
    }

    var nodeUuid = objectID + tool + node;
    var frameUuid = objectID + tool;

    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].developer = globalVariables.developer;
            objects[objectID].name = object;

            if (!objects[objectID].frames.hasOwnProperty(frameUuid)) {
                objects[objectID].frames[frameUuid] = new Frame(objectID, frameUuid);
                utilities.createFrameFolder(object, tool, dirnameO, objectsPath, globalVariables.debug, 'local');
            } else {
                utilities.createFrameFolder(object, tool, dirnameO, objectsPath, globalVariables.debug, objects[objectID].frames[frameUuid].location);
            }
            if (!objects[objectID].frames[frameUuid].hasOwnProperty('nodes')) {
                objects[objectID].frames[frameUuid].nodes = {};
            }

            objects[objectID].frames[frameUuid].name = tool;
            objects[objectID].frames[frameUuid].objectId = objectID;

            var thisObject;

            if (!objects[objectID].frames[frameUuid].nodes.hasOwnProperty(nodeUuid)) {
                objects[objectID].frames[frameUuid].nodes[nodeUuid] = new Node(node, type, objectID, frameUuid, nodeUuid);
                thisObject = objects[objectID].frames[frameUuid].nodes[nodeUuid];
                thisObject.x = utilities.randomIntInc(0, 200) - 100;
                thisObject.y = utilities.randomIntInc(0, 200) - 100;
                if (position) {
                    if (position.x !== undefined) thisObject.x = position.x;
                    if (position.y !== undefined) thisObject.y = position.y;
                    if (position.matrix !== undefined) thisObject.matrix = position.matrix;
                    if (position.scale !== undefined) thisObject.scale = position.scale;
                }
                thisObject.frameSizeX = 100;
                thisObject.frameSizeY = 100;
            }

            thisObject = objects[objectID].frames[frameUuid].nodes[nodeUuid];
            thisObject.text = undefined;

            console.log('added node', {
                node: node,
                object: object,
                frame: tool,
                name: thisObject.name,
            });

            if (!hardwareObjects.hasOwnProperty(object)) {
                hardwareObjects[object] = new EmptyObject(object);
            }

            if (!hardwareObjects[object].frames.hasOwnProperty(frameUuid)) {
                hardwareObjects[object].frames[frameUuid] = new EmptyFrame(tool);
            }

            if (!hardwareObjects[object].frames[frameUuid].nodes.hasOwnProperty(nodeUuid)) {
                hardwareObjects[object].frames[frameUuid].nodes[nodeUuid] = new EmptyNode(node);
                hardwareObjects[object].frames[frameUuid].nodes[nodeUuid].type = type;
            }
        }
    }
};

exports.renameNode = function (object, tool, oldNode, newNode) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            var frameUUID = objectID + tool;
            var nodeUUID = objectID + tool + oldNode;

            if (nodeUUID in objects[objectID].frames[frameUUID].nodes) {
                objects[objectID].frames[frameUUID].nodes[nodeUUID].text = newNode;
                // return
            } /*else {
                for (var key in objects[objectID].nodes) {
                    if (objects[objectID].nodes[key].name === oldNodeName) {
                        objects[objectID].nodes[key].name = newNodeName;
                        return;
                    }
                }
            }*/
        }
    }
    actionCallback({reloadObject: {object: objectID, frame: frameUUID}});
    objectID = undefined;
};

exports.moveNode = function (object, tool, node, x, y, scale, matrix, loyalty) {
    var thisMatrix = null;
    var thisScale = null;
    var thisLoyalty = null;
    if (matrix !== undefined) thisMatrix = matrix;
    if (scale !== undefined) thisScale = scale;
    if (loyalty !== undefined) thisLoyalty = 'object';


    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;
    var nodeID = objectID + tool + node;

    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                if (objects[objectID].frames[frameID].nodes.hasOwnProperty(nodeID)) {
                    objects[objectID].frames[frameID].nodes[nodeID].x = x;
                    objects[objectID].frames[frameID].nodes[nodeID].y = y;
                    if (thisMatrix) {
                        objects[objectID].frames[frameID].nodes[nodeID].matrix = thisMatrix;
                    }
                    if (thisScale) {
                        objects[objectID].frames[frameID].nodes[nodeID].scale = thisScale;
                    }
                    if (thisLoyalty) {
                        objects[objectID].frames[frameID].nodes[nodeID].loyalty = thisLoyalty;
                        objects[objectID].frames[frameID].nodes[nodeID].attachToGroundPlane = true;
                    }
                }
            }
        }
    }
};

exports.removeNode = function (object, tool, node) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;
    var nodeID = objectID + tool + node;
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                if (objects[objectID].frames[frameID].nodes.hasOwnProperty(nodeID)) {
                    deleteLinksToAndFromNode(objectID, frameID, nodeID);
                    let thisNode = objects[objectID].frames[frameID].nodes[nodeID];
                    try {
                        thisNode.deconstruct();
                    } catch (e) {
                        console.warn('Node exists without proper prototype: ' + nodeID);
                    }
                    delete objects[objectID].frames[frameID].nodes[nodeID];
                }
            }
        }
    }
};

exports.attachNodeToGroundPlane = function (object, tool, node, shouldAttachToGroundPlane) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    var frameID = objectID + tool;
    var nodeID = objectID + tool + node;

    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {
                if (objects[objectID].frames[frameID].nodes.hasOwnProperty(nodeID)) {

                    objects[objectID].frames[frameID].nodes[nodeID].attachToGroundPlane = shouldAttachToGroundPlane;
                    console.log('Attached node ' + node + ' to ground plane');
                }
            }
        }
    }
};

exports.pushUpdatesToDevices = function (object) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    actionCallback({reloadObject: {object: objectID}});
};

exports.activate = function (object) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].deactivated = false;
        }
    }
};

exports.deactivate = function (object) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    console.log('hardwareInterfaces.deactivate');
    if (objectID) {
        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].deactivated = true;

        }
    }
};


exports.getObjectIdFromObjectName = function (object) {
    return utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
};

exports.getMarkerSize = function (object) {
    var objectID = utilities.getObjectIdFromTargetOrObjectFile(object, objectsPath);
    return objects[objectID].targetSize;
};

/**
 * @desc developerOn() Enables the developer mode for all RealityInterfaces and enables the developer web interface
 **/
exports.enableDeveloperUI = function (developer) {
    globalVariables.developer = developer;
    for (var objectID in objects) {
        objects[objectID].developer = developer;
    }
};

/**
 * @desc getDebug() checks if debug mode is turned on
 * @return {boolean} true if debug mode is on, false otherwise
 **/
exports.getDebug = function () {
    return globalVariables.debug;
};

let setHardwareInterfaceSettingsImpl = null;
/**
 * Updates the settings.json for a particular hardware interface, based on
 * changes from the webFrontend.  Uses setHardwareInterfaceSettingsImpl to cut
 * through a bunch of abstraction into the heart of the server
 *
 * @param {string} interfaceName - the folder name of the hardwareInterface
 * @param {JSON} settings - JSON structure of the new settings to be written to settings.json
 * @param {Array.<string>} limitToKeys - if provided, only affects the properties of settings whose keys are included in this array
 * @param {successCallback} callback
 */
exports.setHardwareInterfaceSettings = function(interfaceName, settings, limitToKeys, callback) {
    return setHardwareInterfaceSettingsImpl(interfaceName, settings, limitToKeys, callback);
};

/*
 ********** END API FUNCTIONS *********
 */

/**
 * Complement to setup() which is necessary due to the unique positioning of
 * the setHardwareInterfaceSettings function
 */
exports.setHardwareInterfaceSettingsImpl = function(setHardwareInterfaceSettings) {
    setHardwareInterfaceSettingsImpl = setHardwareInterfaceSettings;
};

/**
 * @desc setup() DO NOT call this in your hardware interface. setup() is only called from server.js to pass through some global variables.
 */
exports.setup = function setup(objects_, objectLookup_, knownObjects_,
    socketArray_, globalVariables_, dirnameO_,
    objectsPath_, nodeTypeModules_, blockModules_,
    services_, version_, protocol_, serverPort_,
    hardwareAPICallbacks) {
    objects = objects_;
    objectLookup = objectLookup_;
    knownObjects = knownObjects_;
    socketArray = socketArray_;
    globalVariables = globalVariables_;
    dirnameO = dirnameO_;
    objectsPath = objectsPath_;
    nodeTypeModules = nodeTypeModules_;
    blockModules = blockModules_;
    services = services_;
    version = version_;
    protocol = protocol_;
    serverPort = serverPort_;
    publicDataCallBack = hardwareAPICallbacks.publicData;
    actionCallback = hardwareAPICallbacks.actions;
    callback = hardwareAPICallbacks.data;
    writeObjectCallback = hardwareAPICallbacks.write;
};

exports.reset = function () {
    for (var objectKey in objects) {
        for (var frameKey in objects[objectKey].frames) {
            var frame = objects[objectKey].frames[frameKey];
            for (var nodeKey in frame.nodes) {
                var node = frame.nodes[nodeKey];
                if (node.type === 'logic' || node.frame) {
                    continue;
                }
                // addNode requires that nodeKey === object.name + node.name
                _this.addNode(objects[objectKey].name, frame.name, node.name, node.type);
            }
            _this.clearObject(objectKey);
        }
    }

    console.log('hardwareInterfaces.reset calling reset callbacks');
    for (var i = 0; i < callBacks.resetCallBacks.length; i++) {
        callBacks.resetCallBacks[i]();
    }
};

exports.readCall = function (objectUuid, toolUuid, nodeUuid, data) {
    if (callBacks.hasOwnProperty(objectUuid)) {
        if (callBacks[objectUuid].frames.hasOwnProperty(toolUuid)) {
            if (callBacks[objectUuid].frames[toolUuid].nodes.hasOwnProperty(nodeUuid)) {
                if (callBacks[objectUuid].frames[toolUuid].nodes[nodeUuid].hasOwnProperty('callBack')) {
                    callBacks[objectUuid].frames[toolUuid].nodes[nodeUuid].callBack(data);
                }
            }
        }
    }
};

exports.readPublicDataCall = function (objectUuid, toolUuid, nodeUuid, data) {
    if (callBacks.hasOwnProperty(objectUuid)) {
        if (callBacks[objectUuid].frames.hasOwnProperty(toolUuid)) {
            if (callBacks[objectUuid].frames[toolUuid].nodes.hasOwnProperty(nodeUuid)) {
                if (callBacks[objectUuid].frames[toolUuid].nodes[nodeUuid].hasOwnProperty('publicCallBacks')) {
                    var allCallbacks = callBacks[objectUuid].frames[toolUuid].nodes[nodeUuid].publicCallBacks;
                    allCallbacks.forEach(function (thisCB) {
                        if (data.hasOwnProperty(thisCB.dataObject)) {
                            thisCB.cb(data[thisCB.dataObject]);
                        }
                    });
                }
            }
        }
    }
};

exports.screenObjectCall = function (data) {
    for (var key in screenObjectCallBacks) {
        screenObjectCallBacks[key](data);
    }
};

var screenObjectServerCallBackObject = function (_x, _y, _z, _a, _b) {
};
exports.screenObjectServerCallBack = function (callback) {
    screenObjectServerCallBackObject = callback;
};

// TODO These are the two calls for the page
exports.addScreenObjectListener = function (object, callBack) {
    var objectID = utilities.readObject(objectLookup, object);
    if (objectID) {
        screenObjectCallBacks[objectID] = callBack;
    }
};

exports.writeScreenObjects = function (object, tool, node, touchOffsetX, touchOffsetY) {
    if (!object) object = null;
    if (!tool) tool = null;
    if (!node || node === 'null') node = null;

    var objectKey = utilities.readObject(objectLookup, object); //get globally unique object id
    if (objectKey) object = objectKey;
    if (node && !node.includes(object)) node = object + tool + node;
    if (tool && !tool.includes(object)) tool = object + tool;

    screenObjectServerCallBackObject(object, tool, node, touchOffsetX, touchOffsetY);
};

exports.activateScreen = function (object, port) {
    var objectID = utilities.readObject(objectLookup, object);
    screenPortMap[objectID] = port;
};

exports.getScreenPort = function (objectID) {
    return screenPortMap[objectID];
};

exports.addReadListener = function (object, tool, node, callBack) {
    var objectID = utilities.readObject(objectLookup, object);
    var nodeID = objectID + tool + node;
    var frameID = objectID + tool;

    console.log('Add read listener for objectID: ', objectID);

    if (objectID) {

        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {

                if (!callBacks.hasOwnProperty(objectID)) {
                    callBacks[objectID] = new EmptyObject(objectID);
                }

                if (!callBacks[objectID].frames.hasOwnProperty(frameID)) {
                    callBacks[objectID].frames[frameID] = new EmptyFrame(tool);
                }

                if (!callBacks[objectID].frames[frameID].nodes.hasOwnProperty(nodeID)) {
                    callBacks[objectID].frames[frameID].nodes[nodeID] = new EmptyNode(node);
                }

                console.log('Add read listener: ', callBack);
                callBacks[objectID].frames[frameID].nodes[nodeID].callBack = callBack;

            }
        }
    }
};


exports.addPublicDataListener = function (object, tool, node, dataObject, callBack) {
    var objectID = utilities.readObject(objectLookup, object);
    var nodeID = objectID + tool + node;
    var frameID = objectID + tool;

    console.log('Add publicData listener for objectID: ', objectID);

    if (objectID) {

        if (objects.hasOwnProperty(objectID)) {
            if (objects[objectID].frames.hasOwnProperty(frameID)) {

                if (!callBacks.hasOwnProperty(objectID)) {
                    callBacks[objectID] = new EmptyObject(objectID);
                }

                if (!callBacks[objectID].frames.hasOwnProperty(frameID)) {
                    callBacks[objectID].frames[frameID] = new EmptyFrame(tool);
                }

                if (!callBacks[objectID].frames[frameID].nodes.hasOwnProperty(nodeID)) {
                    callBacks[objectID].frames[frameID].nodes[nodeID] = new EmptyNode(node);
                }

                if (typeof callBacks[objectID].frames[frameID].nodes[nodeID].publicCallBacks === 'undefined') {
                    callBacks[objectID].frames[frameID].nodes[nodeID].publicCallBacks = [];
                }

                callBacks[objectID].frames[frameID].nodes[nodeID].publicCallBacks.push({
                    cb: callBack,
                    dataObject: dataObject
                });
            }
        }
    }
};

exports.connectCall = function (objectUuid, frameUuid, nodeUuid, data) {
    console.log('connectCall');

    if (callBacks.hasOwnProperty(objectUuid)) {
        if (callBacks[objectUuid].frames.hasOwnProperty(frameUuid)) {
            if (callBacks[objectUuid].frames[frameUuid].nodes.hasOwnProperty(nodeUuid)) {
                if (typeof callBacks[objectUuid].frames[frameUuid].nodes[nodeUuid].connectionCallBack === 'function') {
                    callBacks[objectUuid].frames[frameUuid].nodes[nodeUuid].connectionCallBack(data);
                    console.log('Connection callback called');
                } else {
                    console.log('No connection callback');
                }
            }
        }
    }
};

exports.addConnectionListener = function (object, tool, node, callBack) {
    var objectID = utilities.readObject(objectLookup, object);
    var frameID = objectID + tool;
    var nodeID = objectID + tool + node;

    console.log('Add connection listener for objectID: ', objectID, frameID, node);

    if (objectID) {

        if (objects.hasOwnProperty(objectID)) {

            if (!callBacks.hasOwnProperty(objectID)) {
                callBacks[objectID] = new EmptyObject(objectID);
            }

            var callbackObject = callBacks[objectID];

            if (!callbackObject.frames.hasOwnProperty(frameID)) {
                callbackObject.frames[frameID] = new EmptyFrame(tool);
            }

            if (!callbackObject.frames[frameID].nodes.hasOwnProperty(nodeID)) {
                callbackObject.frames[frameID].nodes[nodeID] = new EmptyNode(node);
            }

            callbackObject.frames[frameID].nodes[nodeID].connectionCallBack = callBack;

        }
    }
};

exports.removeReadListeners = function (object, tool) {
    var objectID = utilities.readObject(objectLookup, object);
    var frameID = objectID + tool;
    if (callBacks[objectID].frames[frameID])
        delete callBacks[objectID].frames[frameID];
};

exports.map = function (x, in_min, in_max, out_min, out_max) {
    if (x > in_max) x = in_max;
    if (x < in_min) x = in_min;
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};


exports.addEventListener = function (option, callBack) {
    if (option === 'reset') {
        console.log('Add reset listener');
        callBacks.resetCallBacks.push(callBack);
    }
    if (option === 'shutdown') {
        console.log('Add reset listener');
        callBacks.shutdownCallBacks.push(callBack);
    }
    if (option === 'initialize') {
        console.log('Add initialize listener');
        callBacks.initializeCallBacks.push(callBack);
    }


};

exports.advertiseConnection = function (object, tool, node, logic) {
    if (typeof logic === 'undefined') {
        logic = false;
    }
    var objectID = utilities.readObject(objectLookup, object);
    var nodeID = objectID + tool + node;
    var frameID = objectID + tool;

    var message = {
        advertiseConnection: {
            object: objectID,
            frame: frameID,
            node: nodeID,
            logic: logic,
            names: [object, node]
        }
    };
    actionCallback(message);
};

/**
 * Used by the server to emit a socket message when settings change
 * @param {string} interfaceName - exact name of the hardware interface
 * @param {function} callback
 */
exports.addSettingsCallback = function (interface, callback) {
    if (typeof interfaceSettingsCallbacks[interface] === 'undefined') {
        interfaceSettingsCallbacks[interface] = [];
    }
    interfaceSettingsCallbacks[interface].push(callback);
};

/**
 * Public API for hardware interfaces to trigger when they update any settings
 * @param {string} interfaceName - exact name of the hardware interface
 * @param {JSON} currentSettings - should be the exports.settings
 */
exports.pushSettingsToGui = function (interface, currentSettings) {
    console.log('pushSettingsToGui for ' + interface);
    if (typeof interfaceSettingsCallbacks[interface] !== 'undefined') {
        interfaceSettingsCallbacks[interface].forEach(function (callback) {
            callback(interface, currentSettings);
        });
    }
};

exports.shutdown = function () {

    console.log('hardwareInterfaces.shutdown');
    for (var i = 0; i < callBacks.shutdownCallBacks.length; i++) {
        callBacks.shutdownCallBacks[i]();
    }
};


exports.initialize = function () {

    console.log('server initialized. Every initialization from now on should come from interface addons only');
    for (var i = 0; i < callBacks.initializeCallBacks.length; i++) {
        callBacks.initializeCallBacks[i]();
    }
};

exports.loadHardwareInterface = function (hardwareInterface) {
    return utilities.loadHardwareInterface(hardwareInterface.split(path.sep).pop());
};
