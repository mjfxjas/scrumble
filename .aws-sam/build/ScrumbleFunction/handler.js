const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;
const ACTIVE_MATCHUP_ID = process.env.ACTIVE_MATCHUP_ID || "active";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function getMethod(event) {
  if (event && event.requestContext && event.requestContext.http) {
    return event.requestContext.http.method || "";
  }
  return event.httpMethod || "";
}

function getPath(event) {
  if (event && event.rawPath) {
    return event.rawPath;
  }
  if (event && event.path) {
    return event.path;
  }
  return "/";
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }
  try {
    return JSON.parse(event.body);
  } catch (error) {
    return {};
  }
}

async function getMatchup(matchupId) {
  const result = await dynamo
    .get({
      TableName: TABLE_NAME,
      Key: { matchup_id: matchupId || ACTIVE_MATCHUP_ID },
    })
    .promise();

  if (!result.Item) {
    return response(404, { error: "Matchup not found" });
  }

  return response(200, { matchup: result.Item });
}

async function vote(matchupId, side) {
  if (!side || (side !== "left" && side !== "right")) {
    return response(400, { error: "side must be left or right" });
  }

  const now = new Date().toISOString();
  const updateExpression =
    side === "left"
      ? "ADD left_votes :inc SET updated_at = :now"
      : "ADD right_votes :inc SET updated_at = :now";

  try {
    const result = await dynamo
      .update({
        TableName: TABLE_NAME,
        Key: { matchup_id: matchupId || ACTIVE_MATCHUP_ID },
        ConditionExpression: "attribute_exists(matchup_id)",
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: {
          ":inc": 1,
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      })
      .promise();

    return response(200, { matchup: result.Attributes });
  } catch (error) {
    if (error.code === "ConditionalCheckFailedException") {
      return response(404, { error: "Matchup not found" });
    }
    return response(500, { error: "Unable to record vote" });
  }
}

exports.handler = async (event) => {
  const method = getMethod(event);
  const path = getPath(event);

  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method === "GET" && path.endsWith("/matchup")) {
    const matchupId = event.queryStringParameters
      ? event.queryStringParameters.id
      : undefined;
    return getMatchup(matchupId);
  }

  if (method === "POST" && path.endsWith("/vote")) {
    const body = parseBody(event);
    return vote(body.matchup_id, body.side);
  }

  return response(404, { error: "Not found" });
};
