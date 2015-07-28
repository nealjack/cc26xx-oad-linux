var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var async = require('async');
var prompt = require('prompt');
var crc = require('./crc.js');

//console.dir(argv);

// Programming parameters
var OAD_CONN_INTERVAL = 6; // 15 milliseconds
var OAD_SUPERVISION_TIMEOUT = 50; // 500 milliseconds
var GATT_WRITE_TIMEOUT = 500; // Milliseconds
var write_block_timeout = null;

// OAD parameters
var OAD_SERVICE = 'f000ffc004514000b000000000000000';
var IMG_IDENTIFY_CHAR = 'f000ffc104514000b000000000000000';
var IMG_BLOCK_CHAR = 'f000ffc204514000b000000000000000';
var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;
var HAL_FLASH_WORD_SIZE = 4;

var CONNECTION_PARAMS_SERVICE = 'f000ccc004514000b000000000000000';
var CONN_PARAMS_CHAR = 'f000ccc104514000b000000000000000';
var CONN_PARAMS_REQ_CHAR = 'f000ccc204514000b000000000000000';


var img_hdr = null;
var img = null;
var img_nblocks = null;
var img_iblocks = 0;

// ble connection variables
var target_uuid = null;
var scan_timeout = null;
var scan_timeout_time = 10000; // 10 seconds
var target_device = null;
var programming = true;
//var discovered = new Array();

// Input args
if(argv.h)
{
  print_help();
}
if(!argv.b || !argv.f)
{
  console.log('invalid command line options');
  print_help();
}
else if(argv.b)
{
  target_uuid = argv.b.match(/[0-9a-fA-F][^:]/g).join('').toLowerCase();
  if(target_uuid.length != 12)
  {
    console.log('invalid ble address');
    print_help();
  }
  console.log(target_uuid);
}

init();

function init(){
  fs.readFile(argv.f, function (err, data) {
    if (err) throw err;
    img = data;
    img_nblocks = img.length / OAD_BLOCK_SIZE;
    console.log(img_nblocks);
    img_hdr = prepare_image_header(data);

    noble.on('discover', discover_device);
  });
}

noble.on('stateChange', function (state) {
    console.log("Starting scan...");
    if (state === 'poweredOn') {
      noble.startScanning([], false);
      scan_timeout = setTimeout(function(){
        console.log('Scanning timed out, ensure peripheral is advertising.');
        process.exit();
      }, scan_timeout_time);
    }
    else {
      noble.stopScanning();
    }
});

function prepare_image_header(data)
{
  var len = (img.length / (16 / 4));
  var ver = 0;
  var uid = new Buffer([0x45, 0x45, 0x45, 0x45]);
  var addr = 0;
  var img_type = 1;
  var crc0 = crc.calc_image_crc(0, data);
  console.log('CRC for image is 0x' + crc0.toString(16));
  var crc1 = 0xFFFF;
  var img_hdr = new Buffer(16);
  img_hdr[0] = loUint16(crc0);
  img_hdr[1] = hiUint16(crc0);
  img_hdr[2] = loUint16(crc1);
  img_hdr[3] = hiUint16(crc1);
  img_hdr[4] = loUint16(ver);
  img_hdr[5] = hiUint16(ver);
  img_hdr[6] = loUint16(len);
  img_hdr[7] = hiUint16(len);
  img_hdr[8] = uid[0];
  img_hdr[9] = uid[1];
  img_hdr[10] = uid[2];
  img_hdr[11] = uid[3];
  img_hdr[12] = loUint16(addr);
  img_hdr[13] = hiUint16(addr);
  img_hdr[14] = img_type;
  img_hdr[15] = 0xFF;

  // img_hdr.copy(img);
  // console.log(img.slice(0, 15));

  return img_hdr;
}

function loUint16(x)
{
  // mask as byte
  return x & 0x00FF;
}
function hiUint16(x)
{
  // right shift one byte, mask as byte
  return (x >> 8) & 0x00FF;
}

function discover_device(peripheral)
{
  if(peripheral.uuid === target_uuid)
  {
    clearTimeout(scan_timeout);
    noble.stopScanning();
    target_device = peripheral;
    console.log('found requested peripheral ' + target_uuid.match(/../g).join(':'))
    target_device.connect(function(err) {
      if(err) throw err;
      console.log('connected to ' + target_uuid.match(/../g).join(':'));
      //TODO reorg:
      set_connection_params(function(){
        print_firmware(function(){
          oad_program();
        });
      });
    });
    target_device.on('disconnect', function() {
      console.log('\ndisconnected');
      process.exit(0);
    });
  }
}

function print_firmware(callback){
  var service_uuids = ['180a'];
  var characteristic_uuids = ['2a26'];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);

    char = characteristics[0];
    char.read(function(err, data){
      if(err) throw err;
      console.log('Current device firmware is ' + data.toString('ascii'));
      callback();
    });
  });
}

function set_connection_params(callback){
  var service_uuids = [CONNECTION_PARAMS_SERVICE];
  var characteristic_uuids = [CONN_PARAMS_CHAR, CONN_PARAMS_REQ_CHAR];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    //TODO better check for existing characteristics/services
    if(!characteristics[0]){
      throw new Error('characteristic0 doesn\'t exist!');
    }
    else if(!characteristics[1]){
      throw new Error('characteristic1 doesn\'t exist');
    }

    conn_params_char = characteristics[0];
    conn_params_char.read(function(err, data){
      console.log(data);
    });
    conn_params_char.notify(true, function(err){
      conn_params_char.on('data', function(data, notification){
        console.log('successfully wrote new connection parameters:');
        console.log(data);
        callback();
      });
    });

    conn_params_req_char = characteristics[1];
    var param_buf = new Buffer([loUint16(OAD_CONN_INTERVAL), hiUint16(OAD_CONN_INTERVAL),
                                loUint16(OAD_CONN_INTERVAL), hiUint16(OAD_CONN_INTERVAL),
                                0,0,
                                loUint16(OAD_SUPERVISION_TIMEOUT), hiUint16(OAD_SUPERVISION_TIMEOUT)]);
    console.log(param_buf);
    conn_params_req_char.write(param_buf, false, function(err){
      if(err) throw err;
      console.log('attempted to write new connection parameters');
    });
  });
}



function oad_program(){
  // OAD service
  var service_uuids = [OAD_SERVICE];
  // Img Identify, Img Block
  var characteristic_uuids = [IMG_IDENTIFY_CHAR, IMG_BLOCK_CHAR];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);
    img_identify_char = characteristics[0];
    img_block_char = characteristics[1];
    console.log('ready to program device ' + target_uuid.match(/../g).join(':'));

    prompt.start();
    console.log('start? (y/n)');
    prompt.get(['start'], function (err, result){
      if(err) throw err;
      if(result.start !== 'y'){
        target_device.disconnect();
      }

      console.log('programming device with ' + argv.f);

      // noble enable notifications for characteristics
      img_block_char.notify(true, function(err){
        if(err) throw err;
        img_block_char.on('data', block_notify);
        img_identify_char.notify(true, function(err){
          if(err) throw err;
          img_identify_char.on('data', rejected_header);
          img_identify_char.write(img_hdr, false);
        });
      });


      //target_device.disconnect();
    });
  });
}

function block_notify(data, notification){
  //console.log('got notification from block characteristic');
  // if(notification) {
  //   console.log(data);
  // }
  if(!programming){
    console.log('this is bad');
    return;
  }
  //clearTimeout(write_block_timeout);
  if(img_iblocks < img_nblocks){
    programming = true;
    //console.log('sending block ' + img_iblocks);
    var block_buf = new Buffer(OAD_BUFFER_SIZE);
    block_buf[0] = data[0];
    block_buf[1] = data[1];
    img.copy(block_buf, 2, img_iblocks * OAD_BLOCK_SIZE, (img_iblocks + 1) * OAD_BLOCK_SIZE);
    //console.log('sending buffer:');
    //console.log(block_buf);
    img_block_char.write(block_buf, false, function(err){
      if(err) throw err;
      ++img_iblocks;
      process.stdout.write("Downloaded " + img_iblocks + "/" + img_nblocks +" blocks\r");
      if(img_iblocks === img_nblocks){
        console.log('\nfinished programming');
        console.log('trying to stop notifying img_block_char');
        img_block_char.notify(false, function(err){
          img_identify_char.notify(false, function(err){
            console.log('done');

          });
        });
      }
      // write_block_timeout = setTimeout(function(){
      //   --img_iblocks;
      //   console.log('\nwrite timeout, retrying');
      //   block_notify(data, true);
      // }, GATT_WRITE_TIMEOUT);
      //console.log('sent block');
    });
  }
}

function rejected_header(data, notification){
  //TODO better error checking
  console.log('got something from identify');
}

function chars_servs_exist(err, services, characteristics){
  if(!services[0]){
    throw new Error('no services found');
  }
  if(!characteristics[0]){
    throw new Error('no characteristics found');
  }
  if(err) throw err;
}

function print_help(){
  console.log('\n-h displays this message');
  console.log('-b for device address in the form XX:XX:XX:XX:XX:XX');
  console.log('-f provides a required filename for firmware *.bin\n');
  process.exit();
}

// function choose_device(devices)
// {
//   console.log("Discovered devices:");
//   for(var i = 0; i < devices.length; ++i)
//   {
//     console.log(i + ' ' + devices[i].uuid + ' ' + devices[i].advertisement.localName);
//   }
//
//   var rli = readline.createInterface({
//     input: process.stdin,
//     output:process.stdout
//   });
//
//   rli.question('Enter list index of discovered device: ', function(answer) {
//     target_device = devices[answer];
//     rli.close();
//   });
//
// }
