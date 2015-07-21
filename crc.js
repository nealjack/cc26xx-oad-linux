var CRC_POLY = 0x1021;
var BYTE_MASK = 0xFF;
var SHORT_MASK = 0xFFFF;

function calc_image_crc(page, buf){
  var crc = 0x00;
  var addr = page * 0x1000;

  var pageBeg = page & SHORT_MASK;
  var pageEnd = (buf.length / (0x1000 / 4)) & BYTE_MASK;
  var osetEnd = ((buf.length - (pageEnd * (0x1000 / 4))) * 4);

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
  val &= BYTE_MASK;
  crc &= SHORT_MASK;

  for(var cnt = 0; cnt < 8; cnt++, val <<= 1)
  {
    var msb;
    val &= BYTE_MASK;

    if((crc & 0x8000) === 0x8000) {
      msb = 1;
    }
    else msb = 0;

    crc <<= 1;
    crc &= SHORT_MASK;

    if((val & 0x80) === 0x80) {
      crc |= 0x0001;
    }
    if(msb == 1){
      crc ^= CRC_POLY;
    }
  }

  return crc &= SHORT_MASK;
}

module.exports.calc_image_crc = calc_image_crc;
