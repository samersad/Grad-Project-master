function sanitizePayload(payload, fields) {
  const allowed = new Set(fields);
  return Object.fromEntries(Object.entries(payload || {}).filter(([key]) => allowed.has(key)));
}

function parseSort(query, fallback = '-createdAt') {
  if (!query.order && !query.orderBy) return fallback;
  const field = query.order || query.orderBy;
  return query.ascending === 'false' ? `-${field}` : field;
}

function applyFilters(target, filter) {
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') target[key] = value;
  });
  return target;
}

const fields = {
  user: ['id', 'name', 'email', 'college', 'phoneNumber', 'gender', 'role', 'photoUrl', 'fcmToken', 'createdAt'],
  apartment: [
    'id',
    'name',
    'description',
    'price',
    'images',
    'video_url',
    'bedrooms',
    'bathrooms',
    'living_rooms',
    'floor',
    'max_people',
    'available_people',
    'address',
    'city',
    'district',
    'locationAddress',
    'lat',
    'lng',
    'ownerId',
    'ownerName',
    'ownerPhotoUrl',
    'verified',
    'rating_sum',
    'rating_count',
    'rating_average',
    'createdAt',
  ],
  booking: [
    'id',
    'apartmentId',
    'apartmentName',
    'apartmentAddress',
    'apartmentImage',
    'clientId',
    'clientName',
    'ownerId',
    'ownerName',
    'startDate',
    'endDate',
    'totalPrice',
    'people_count',
    'rating',
    'rated_at',
    'status',
    'createdAt',
  ],
  notification: ['id', 'title', 'body', 'createdAt', 'isRead', 'type', 'receiverId', 'bookingId', 'chatId', 'senderId'],
  chat: ['id', 'users', 'lastMessage', 'timestamp', 'displayNames', 'displayPhotos'],
  message: ['id', 'chat_id', 'senderId', 'message', 'timestamp'],
};

module.exports = {
  fields,
  sanitizePayload,
  parseSort,
  applyFilters,
};
