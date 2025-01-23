const mongoose = require('mongoose');

// Define the schema for the counter
const counterDriverSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence_value: { type: Number, required: true }
});

// Create a model from the schema
const CounterDriver = mongoose.model('driver_counter', counterDriverSchema);

// Get the next sequence value function
async function getDriverNextSequenceValue() {
  const sequenceDoc = await CounterDriver.findByIdAndUpdate(
    'driverId', // Unique identifier for this counter
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
    const newDoc = await CounterDriver.create({ _id: 'driverId', sequence_value: 1000 });
    return newDoc.sequence_value;
  }

  return sequenceDoc.sequence_value;
}

// Initialize the counter only if necessary
async function initializeCounter() {
  const counter = await CounterDriver.findById('driverId');
  if (!counter) {
    await CounterDriver.create({ _id: 'driverId', sequence_value: 1000 });
  }
}

// Export the model and the sequence function
module.exports = {
    CounterDriver,
    getDriverNextSequenceValue
};
