var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var async = require('async');


var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;


console.dir(argv);

var target_uuid = null;
var scan_timeout = null;
var target_device = null;
var discovered = new Array();

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
    console.log(data.length);
    noble.on('discover', discover_device);
  });

  // noble init, device discover
  noble.on('stateChange', function (state) {
      console.log("Starting scan...");
      if (state === 'poweredOn') {
        noble.startScanning([], false);
        scan_timeout = setTimeout(function(){
          console.log('Scanning timed out, ensure peripheral is advertising.');
          process.exit();
        }, 10000);
      }
      else {
        noble.stopScanning();
      }
  });
}

function discover_device(peripheral)
{
  console.log(peripheral.uuid);
  if(peripheral.uuid === target_uuid)
  {
    clearTimeout(scan_timeout);
    noble.stopScanning();
    target_device = peripheral;
    console.log('found requested peripheral ' + target_uuid.match(/../g).join(':'))
    target_device.connect(function(err) {
      if(err) throw err;
      console.log('connected to ' + target_uuid.match(/../g).join(':'));
      print_firmware(oad_program);
    });
    target_device.on('disconnect', function() {
      console.log('disconnected');
      process.exit(0);
    });
  }
}

function print_firmware(callback){
  service_uuids = ['180a'];
  characteristic_uuids = ['2a26'];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);

    char = characteristics[0];
    char.read(function(err, data){
      console.log('Current device firmware is ' + data.toString('ascii'));
      callback();
    });
  });
}



function oad_program(){
  // OAD service
  service_uuids = ['f000ffc004514000b000000000000000'];
  // Img Identify, Img Block
  characteristic_uuids = ['f000ffc104514000b000000000000000', 'f000ffc204514000b000000000000000'];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);

    console.log('programming device ' + target_uuid.match(/../g).join(':'));
    //TODO actually program
  });
  target_device.disconnect();
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

function print_help()
{
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
