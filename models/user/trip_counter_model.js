const mongoose = require('mongoose');

// Define the schema for the counter
const counterTripSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence_value: { type: Number, required: true }
});

// Create a model from the schema
const CounterTrip = mongoose.model('trip_counter', counterTripSchema);

// Get the next sequence value function
async function getNextSequenceValue() {
  const sequenceDoc = await CounterTrip.findByIdAndUpdate(
    'tripId', // Unique identifier for this counter
    { $inc: { sequence_value: 1 } }, // Increment the value by 1
    {
      new: true,
      upsert: true, // Create the document if it doesn't exist
      setDefaultsOnInsert: true, // Apply default values on insert
      fields: { sequence_value: 1 }, // Only return sequence_value
    }
  );

  // If this is the first time, set initial value to 1000
  if (!sequenceDoc) {
    const newDoc = await CounterTrip.create({ _id: 'tripId', sequence_value: 1000 });
    return newDoc.sequence_value;
  }

  return sequenceDoc.sequence_value;
}

// Initialize the counter only if necessary
async function initializeCounter() {
  const counter = await CounterTrip.findById('tripId');
  if (!counter) {
    await CounterTrip.create({ _id: 'tripId', sequence_value: 1000 });
  }
}

// Export the model and the sequence function
module.exports = {
  CounterTrip,
  getNextSequenceValue
};
