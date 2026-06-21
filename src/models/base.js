const { randomUUID } = require('crypto');

function uuid() {
  return randomUUID();
}

function transform(_doc, ret) {
  delete ret._id;
  delete ret.__v;
  delete ret.passwordHash;
  return ret;
}

const jsonOptions = {
  virtuals: false,
  versionKey: false,
  transform,
};

module.exports = {
  uuid,
  jsonOptions,
};
