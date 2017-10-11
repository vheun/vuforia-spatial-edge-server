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
 * Hybrid Objecst Hardware Interface API
 * 
 * This API is intended for users who want to create their own hardware interfaces.
 * To create a new hardware interface create a folder under hardwareInterfaces and create the file index.js.
 * You should take a look at /hardwareInterfaces/emptyExample/index.js to get started.
 */

var http = require('http');
var utilities = require(__dirname + '/utilities');
var _ = require('lodash');

//global variables, passed through from server.js
var objects = {};
var objectLookup;
var globalVariables;
var dirnameO;
var nodeTypeModules;
var blockModules;
var callback;
var Node;
var actionCallback;
var hardwareObjects = {};
var callBacks = new Objects();
var _this = this;
//data structures to manage the IO points generated by the API user
function Objects() {
    this.resetCallBacks = [];
    this.shutdownCallBacks = [];
}

function Object(objectName) {
    this.name = objectName;
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
 * @desc This function writes the values passed from the hardware interface to the HybridObjects server.
 * @param {string} objectName The name of the HybridObject
 * @param {string} nodeName The name of the IO point
 * @param {value} value The value to be passed on
 * @param {string} mode specifies the datatype of value, you can define it to be whatever you want. For example 'f' could mean value is a floating point variable.
 **/
exports.write = function (objectName, nodeName, value, mode, unit, unitMin, unitMax) {
    if (typeof mode === 'undefined')  mode = "f";
    if (typeof unit === 'undefined')  unit = false;
    if (typeof unitMin === 'undefined')  unitMin = 0;
    if (typeof unitMax === 'undefined')  unitMax = 1;

    var objectKey = utilities.readObject(objectLookup, objectName); //get globally unique object id
    //  var valueKey = nodeName + objKey2;

    var nodeUuid = objectKey+nodeName;
    //console.log(objectLookup);
//    console.log("writeIOToServer obj: "+objectName + "  name: "+nodeName+ "  value: "+value+ "  mode: "+mode);
    if (objects.hasOwnProperty(objectKey)) {
        if (objects[objectKey].nodes.hasOwnProperty(nodeUuid)) {
            var thisData = objects[objectKey].nodes[nodeUuid].data;
            thisData.value = value;
            thisData.mode = mode;
            thisData.unit = unit;
            thisData.unitMin = unitMin;
            thisData.unitMax = unitMax;
            //callback is objectEngine in server.js. Notify data has changed.
            callback(objectKey, nodeUuid, thisData, objects, nodeTypeModules);
        }
    }
};

/**
 * @desc clearIO() removes IO points which are no longer needed. It should be called in your hardware interface after all addIO() calls have finished.
 * @param {string} type The name of your hardware interface (i.e. what you put in the type parameter of addIO())
 **/
exports.clearObject = function (objectId) {
    var objectID = utilities.getObjectIdFromTarget(objectId, dirnameO);
    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {
        for (var key in objects[objectID].nodes) {
            if (!hardwareObjects[objectId].nodes.hasOwnProperty(key)) {
                cout("Deleting: " + objectID + "   " + key);
                delete objects[objectID].nodes[key];
            }
        }

    }
    //TODO: clear links too
    cout("object is all cleared");
};

/**
 * @desc addIO() a new IO point to the specified HybridObject
 * @param {string} objectName The name of the HybridObject
 * @param {string} nodeName The name of the nodeName
 * @param {string} type The name of the data conversion type. If you don't have your own put in "default".
 **/
exports.addNode = function (objectName, nodeName, type) {



    utilities.createFolder(objectName, dirnameO, globalVariables.debug);

    var objectID = utilities.getObjectIdFromTarget(objectName, dirnameO);
    cout("AddIO objectID: " + objectID);

    var nodeUuid = objectID+nodeName;

    //objID = nodeName + objectID;

    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {

        cout("I will save: " + objectName + " and: " + nodeName);

        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].developer = globalVariables.developer;
            objects[objectID].name = objectName;

            if (!objects[objectID].nodes.hasOwnProperty(nodeUuid)) {
                var thisObject = objects[objectID].nodes[nodeUuid] = new Node();
                thisObject.x = utilities.randomIntInc(0, 200) - 100;
                thisObject.y = utilities.randomIntInc(0, 200) - 100;
                thisObject.frameSizeX = 100;
                thisObject.frameSizeY = 100;
            }

            var thisObj = objects[objectID].nodes[nodeUuid];
            thisObj.name = nodeName;
            thisObj.text = undefined;
            thisObj.type = type;

            if (!hardwareObjects.hasOwnProperty(objectName)) {
                hardwareObjects[objectName] = new Object(objectName);
            }

            if (!hardwareObjects[objectName].nodes.hasOwnProperty(nodeUuid)) {
                hardwareObjects[objectName].nodes[nodeUuid] = new EmptyNode(nodeName);
                hardwareObjects[objectName].nodes[nodeUuid].type = type;
            }
        }
    }
    objectID = undefined;
};

exports.renameNode = function (objectName,oldNodeName, newNodeName) {
    var objectID = utilities.getObjectIdFromTarget(objectName, dirnameO);
    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {
        if (objects.hasOwnProperty(objectID)) {
            var thisNode = objectID+oldNodeName;

            if(thisNode in objects[objectID].nodes){
                objects[objectID].nodes[thisNode].text = newNodeName;
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
    actionCallback({reloadObject: {object: objectID}});
    objectID = undefined;
};

exports.activate = function (objectName) {
    var objectID = utilities.getObjectIdFromTarget(objectName, dirnameO);
    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {
        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].deactivated = false;
        }
    }
};

exports.deactivate = function (objectName) {
    var objectID = utilities.getObjectIdFromTarget(objectName, dirnameO);
    console.log("--------- deactive---------")
    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {
        if (objects.hasOwnProperty(objectID)) {
            objects[objectID].deactivated = true;

        }
    }
};




exports.getObjectIdFromObjectName = function (objectName) {
    return utilities.getObjectIdFromTarget(objectName, dirnameO);
};

/**
 * @desc developerOn() Enables the developer mode for all HybridObjects and enables the developer web interface
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

/*
 ********** END API FUNCTIONS *********
 */

/**
 * @desc setup() DO NOT call this in your hardware interface. setup() is only called from server.js to pass through some global variables.
 **/
exports.setup = function (objExp, objLookup, glblVars, dir, types, blocks, cb, objValue, actionCallBack) {
    objects = objExp;
    objectLookup = objLookup;
    globalVariables = glblVars;
    dirnameO = dir;
    nodeTypeModules = types;
    blockModules = blocks;
    callback = cb;
    Node = objValue;
    actionCallback = actionCallBack;
};

exports.reset = function (){
    for (var objectKey in objects) {
        var object = objects[objectKey];
        for (var nodeKey in object.nodes) {
            var node = object.nodes[nodeKey]
            if (node.type === "logic" || node.frame) {
                continue;
            }
            // addNode requires that nodeKey === object.name + node.name
            _this.addNode(object.name, node.name, node.type);
        }
        _this.clearObject(objectKey);
    }

    cout("sendReset");
    for (var i = 0; i < callBacks.resetCallBacks.length; i++) {
        callBacks.resetCallBacks[i]();
    }
};

exports.readCall = function (objectName, nodeName, data) {
    if (callBacks.hasOwnProperty(objectName)) {
        if (callBacks[objectName].nodes.hasOwnProperty(nodeName)) {
            callBacks[objectName].nodes[nodeName].callBack(data);
        }
    }
};

exports.addReadListener = function (objectName, nodeName, callBack) {
    var objectID = utilities.readObject(objectLookup, objectName);
    var nodeID = objectID+nodeName;

    cout("Add read listener for objectID: " + objectID);

    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {

        if (objects.hasOwnProperty(objectID)) {
            if (!callBacks.hasOwnProperty(objectID)) {
                callBacks[objectID] = new Object(objectID);
            }

            if (!callBacks[objectID].nodes.hasOwnProperty(nodeID)) {
                callBacks[objectID].nodes[nodeID] = new EmptyNode(nodeName);
                callBacks[objectID].nodes[nodeID].callBack = callBack;
            } else {
                callBacks[objectID].nodes[nodeID].callBack = callBack;
            }
        }
    }
};

exports.connectCall = function (objectName, nodeName, data) {
    if (callBacks.hasOwnProperty(objectName)) {
        if (callBacks[objectName].nodes.hasOwnProperty(nodeName)) {

            if (typeof callBacks[objectName].nodes[nodeName].connectionCallBack == 'function') {
                callBacks[objectName].nodes[nodeName].connectionCallBack(data);
                console.log("connection callback called");
            } else {
                console.log("no connection callback");
            }
        }
    }
};

exports.addConnectionListener = function (objectName, nodeName, callBack) {
    var objectID = utilities.readObject(objectLookup, objectName);
    var nodeID = objectID+nodeName;

    cout("Add connection listener for objectID: " + objectID);

    if (!_.isUndefined(objectID) && !_.isNull(objectID)) {

        if (objects.hasOwnProperty(objectID)) {
            if (!callBacks.hasOwnProperty(objectID)) {
                callBacks[objectID] = new Object(objectID);
            }

            if (!callBacks[objectID].nodes.hasOwnProperty(nodeID)) {
                callBacks[objectID].nodes[nodeID] = new EmptyNode(nodeName);
                callBacks[objectID].nodes[nodeID].connectionCallBack = callBack;
            } else {
                callBacks[objectID].nodes[nodeID].connectionCallBack = callBack;
            }
        }
    }
}

exports.removeReadListeners = function (objectName){
    var objectID = utilities.readObject(objectLookup, objectName);
    if(callBacks[objectID])
    delete callBacks[objectID];
};

exports.map = function (x, in_min, in_max, out_min, out_max) {
    if (x > in_max) x = in_max;
    if (x < in_min) x = in_min;
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};


exports.addEventListener = function (option, callBack){
    if(option === "reset") {
        cout("Add reset listener");
        callBacks.resetCallBacks.push(callBack);
    }
    if(option === "shutdown") {
        cout("Add reset listener");
        callBacks.shutdownCallBacks.push(callBack);
    }

};

exports.advertiseConnection = function (object, node, logic){
    if(typeof logic === "undefined") {
        logic = false;
    }
    var objectID = utilities.readObject(objectLookup, object);
    var nodeID = objectID+node;

    var message = {advertiseConnection:{
        object: objectID,
        node: nodeID,
        logic: logic,
        names: [object, node],
    }};
    actionCallback(message);
};

exports.shutdown = function (){

    cout("call shutdowns");
    for (var i = 0; i < callBacks.shutdownCallBacks.length; i++) {
        callBacks.shutdownCallBacks[i]();
    }
};

function cout(msg) {
    if (globalVariables.debug) console.log(msg);
}