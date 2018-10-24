/**
 * @preserve
 *
 *                                     .,,,;;,'''..
 *                                 .'','...     ..',,,.
 *                               .,,,,,,',,',;;:;,.  .,l,
 *                              .,',.     ...     ,;,   :l.
 *                             ':;.    .'.:do;;.    .c   ol;'.
 *      ';;'                   ;.;    ', .dkl';,    .c   :; .'.',::,,'''.
 *     ',,;;;,.                ; .,'     .'''.    .'.   .d;''.''''.
 *    .oxddl;::,,.             ',  .'''.   .... .'.   ,:;..
 *     .'cOX0OOkdoc.            .,'.   .. .....     'lc.
 *    .:;,,::co0XOko'              ....''..'.'''''''.
 *    .dxk0KKdc:cdOXKl............. .. ..,c....
 *     .',lxOOxl:'':xkl,',......'....    ,'.
 *          .';:oo:...                        .
 *               .cd,    ╔═╗┌─┐┬─┐┬  ┬┌─┐┬─┐   .
 *                 .l;   ╚═╗├┤ ├┬┘└┐┌┘├┤ ├┬┘   '
 *                   'l. ╚═╝└─┘┴└─ └┘ └─┘┴└─  '.
 *                    .o.                   ...
 *                     .''''','.;:''.........
 *                          .'  .l
 *                         .:.   l'
 *                        .:.    .l.
 *                       .x:      :k;,.
 *                       cxlc;    cdc,,;;.
 *                      'l :..   .c  ,
 *                      o.
 *                     .,
 *
 *             ╦ ╦┬ ┬┌┐ ┬─┐┬┌┬┐  ╔═╗┌┐  ┬┌─┐┌─┐┌┬┐┌─┐
 *             ╠═╣└┬┘├┴┐├┬┘│ ││  ║ ║├┴┐ │├┤ │   │ └─┐
 *             ╩ ╩ ┴ └─┘┴└─┴─┴┘  ╚═╝└─┘└┘└─┘└─┘ ┴ └─┘
 *
 * Created by Valentin on 10/22/14.
 * Modified by Carsten on 12/06/15.
 *
 * Copyright (c) 2015 Valentin Heun
 *
 * All ascii characters above must be included in any redistribution.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Set to true to enable the hardware interface
 **/
var server = require(__dirname + '/../../libraries/hardwareInterfaces');
var path = require('path');
var thisHardwareInterface = __dirname.split(path.sep).pop();
var settings = server.loadHardwareInterface(thisHardwareInterface);

exports.enabled = false;


if (exports.enabled) {
    var PowerMate = require('node-powermate');
    var powermate = new PowerMate();

    server.addEventListener("shutdown", function () {
        powermate.close();
    });
	server.enableDeveloperUI(true);
	server.addNode("box", "arduino01", "rotation", "node");
	//server.addNode("box", "button", "node");

    powermate.on('buttonDown', function(){});
    powermate.on('buttonUp',  function(){});

    var buttonValue = 0.0;
    var buttonValueOld = 0.1;

    setInterval(function(){
if(buttonValue != buttonValueOld)
        server.write("box", "arduino01", "rotation", buttonValue);

/*server.addReadListener("box","rotation",function(value){
    console.log(value);
});*/
        buttonValueOld = buttonValue;

    }, 20);

    powermate.on('wheelTurn', function(data){

        buttonValue =  Math.round((buttonValue+(data / 33)) * 100) / 100;


        if(buttonValue >1) buttonValue =1;
        if(buttonValue <-1) buttonValue =-1;
        if(buttonValue <= 0.01 && buttonValue >= -0.01) buttonValue = 0;
        //server.write("box", "rotation", buttonValue);
    	//console.log(buttonValue);
	});

}