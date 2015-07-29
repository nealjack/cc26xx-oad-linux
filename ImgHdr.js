var binary = require('./Binary');

var CRC_POLY = 0x1021;
var HAL_FLASH_WORD_SIZE = 4;

function ImgHdr(buf) {
  this.len = buf.length / HAL_FLASH_WORD_SIZE;
  this.ver = 0;
  this.uid = new Buffer('EEEE', 'utf-8');
  this.addr = 0;
  this.imgType = 1; //EFL_OAD_IMG_TYPE_APP
  this.crc0 = this.calcImageCRC(0, buf);
  this.crc1 = 0xFFFF;
}

ImgHdr.prototype.getRequest = function() {
  var tmp = new Buffer(16);
  tmp[0] = binary.loUint16(this.crc0);
  tmp[1] = binary.hiUint16(this.crc0);
  tmp[2] = binary.loUint16(this.crc1);
  tmp[3] = binary.hiUint16(this.crc1);
  tmp[4] = binary.loUint16(this.ver);
  tmp[5] = binary.hiUint16(this.ver);
  tmp[6] = binary.loUint16(this.len);
  tmp[7] = binary.hiUint16(this.len);
  tmp[8] = this.uid[0];
  tmp[9] = this.uid[1];
  tmp[10] = this.uid[2];
  tmp[11] = this.uid[3];
  tmp[12] = binary.loUint16(this.addr);
  tmp[13] = binary.hiUint16(this.addr);
  tmp[14] = this.imgType;
  tmp[15] = 0xFF;

  return tmp;
}

ImgHdr.prototype.calcImageCRC = function(page, buf){
  var crc = 0x00;
  var addr = page * 0x1000;

  var pageBeg = page & binary.BYTE_MASK;
  var pageEnd = (this.len / (0x1000 / 4)) & binary.BYTE_MASK;
  var osetEnd = ((this.len - (pageEnd * (0x1000 / 4))) * 4);

  pageEnd += pageBeg;

  while(true) {
    for(var oset = 0; oset < 0x1000; oset++) {
      if((page === pageBeg) && (oset === 0x00)) {
        // Skip the CRC and CRC shadow.
        // CRC and CRC shadow are each 2 bytes, so 4 bytes total
        // Skip three because we increment one more time on next loop.
        oset += 3;
      }
      else if ((page === pageEnd) && (oset === osetEnd)) {
        crc = crc16(crc, 0x00);
        crc = crc16(crc, 0x00);

        return crc;
      }
      else {
        crc = crc16(crc, buf[(addr + oset)]);
      }
    }
    page += 1;
    addr = page * 0x1000;
  }
}

function crc16(crc, val) {
  val &= binary.BYTE_MASK;
  crc &= binary.SHORT_MASK;

  for(var cnt = 0; cnt < 8; cnt++, val <<= 1) {
    var msb;
    val &= binary.BYTE_MASK;

    if((crc & 0x8000) === 0x8000) {
      msb = 1;
    }
    else msb = 0;

    crc <<= 1;
    crc &= binary.SHORT_MASK;

    if((val & 0x80) === 0x80) {
      crc |= 0x0001;
    }
    if(msb === 1){
      crc ^= CRC_POLY;
      crc &= binary.SHORT_MASK;
    }
  }

  return crc &= binary.SHORT_MASK;
}

module.exports = ImgHdr;
