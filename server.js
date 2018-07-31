const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors');
const request = require('request');
const rp = require('request-promise');
const bitcore = require('bitcore-lib');
const Message = require('bitcore-message');
const fs = require('fs');
const util = require('util');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const url = 'nav.community'
const app = express();

const auth = "Basic " + Buffer.from(config.user + ":" + config.password).toString("base64");

app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())

app.post('/', async function (req, res) {
  const { address, addressSig, prevaddressSig } = req.body
  const name = typeof req.body.name === 'string' ? req.body.name.toLowerCase() : ''
  let { prevaddress } = req.body
  let addressVerification = ''
  let prevaddressVerification = ''

  if (!name || !address || !addressSig) {
    return res.status(400).json({ error: 'Missing required fields, please ensure you included an alias, address, and a signature.', address: address || 'Missing', name: name || 'Missing', addressSig: addressSig || 'Missing', prevaddress: prevaddress || 'Missing', prevaddressSig: prevaddressSig || 'Missing' })
  }

  // Verify Email Address
  if (/[^a-zA-Z0-9\.]/.test(name)) {
    return res.status(400).json({ error: 'Username can only contain alphanumeric characters (a-z and 0-9) and dots (.)', name, address, addressSig, prevaddress, prevaddressSig });
  }

  // Verify NavCoin Addresses
  if (!verifyAddress(address)) {
    return res.status(400).json({ error: 'Invalid NavCoin address: ' + address, name, address, addressSig, prevaddress, prevaddressSig});
  }

  try {
    prevaddress = await checkDNS(name)
  } catch (err) {
    return res.status(500).json({ error: 'Could not reach DNS server. Try again later.', name, address, addressSig, prevaddress, prevaddressSig });
  }

  // If we have a prevaddress..
  if (prevaddress) {
    // .. we check if it's invalid and error.
    if (!verifyAddress(prevaddress)) {
      return res.status(400).json({ error: 'Invalid NavCoin address' + prevaddress, name, address, addressSig, prevaddress, prevaddressSig });
    }

    // Return error if incorrectly signed.
    // Need try catch because bitcore doesnt handle invalid sigs.
    try {
      prevaddressVerification = Message(name + '@nav.community').verify(prevaddress, prevaddressSig)
      if (!prevaddressVerification) {
        throw new Error()
      }
    } catch (err) {
      return res.status(400).json({ error: 'Previous Address Signature incorrect. Someone else may already own this alias.', name, address, addressSig, prevaddress, prevaddressSig });
    }
  }

  // Check  address signature
  // We need try catch because bitcore message doesn't handle invalid sigs
  try {
    addressVerification = Message(name + '@nav.community').verify(address, addressSig)
    if (!addressVerification) { throw new Error() }
  } catch (err) {
    return res.status(400).json({ error: 'Address Signature incorrect', name, address, addressSig, prevaddress, prevaddressSig });
  }

  // Update the DNS server
  rp({
    uri: util.format(config.url, `${name}.nav.community`, "txt"),
    method: "PUT", headers: { "Authorization": auth },
    body: `oa1:nav recipient_address=${address};`
  }).then( () => {
    return res.status(200).json({ openAlias: `${name}.nav.community`, address, name });
  }).catch( err => {
    return res.status(500).json({ error: 'Unknown error. Please try again later', name, address, addressSig, prevaddress, prevaddressSig });
  })

});

const checkDNS = async (name) => {
  return new Promise(async function(resolve, reject) {
    try {
      const response = await rp({
        uri: util.format(config.url, `${name}.nav.community`, "txt"),
        method: "GET", headers: { "Authorization": auth },
      })

      const json = JSON.parse(response)

      if (json.length > 0) {
        const oaAddr = json[0].value.split("oa1:nav recipient_address=")[1].split(";")[0];
        if (oaAddr) {
          resolve(orAddr)
        }
      }

      resolve('')
    } catch (err) {
      reject(err)
    }
  })
}

const verifyAddress = (address) => {
  try {
    new bitcore.Address(address);
  } catch (e) {
    return false
  }
  return true
}

app.listen(process.env.PORT || config.port, function () {
console.log(`Server started on localhost:${process.env.PORT || config.port}`)
})
