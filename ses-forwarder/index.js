const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const ses = new AWS.SES();

exports.handler = async (event) => {
  const record = event.Records[0].ses;
  const messageId = record.mail.messageId;
  
  const params = {
    Bucket: 'scrumble-ses-emails',
    Key: `emails/${messageId}`
  };
  
  const email = await s3.getObject(params).promise();
  const emailContent = email.Body.toString();
  
  const forwardParams = {
    Source: 'hello@scrumble.cc',
    Destination: { ToAddresses: ['jon@theatrico.org'] },
    RawMessage: { Data: emailContent }
  };
  
  await ses.sendRawEmail(forwardParams).promise();
  return { statusCode: 200 };
};
