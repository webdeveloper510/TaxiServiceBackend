const mongoose = require('mongoose');

// Define the schema for the counter
const counterCompanySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence_value: { type: Number, required: true }
});

// Create a model from the schema
const CounterCompany = mongoose.model('company_counter', counterCompanySchema);

// Get the next sequence value function
async function getCompanyNextSequenceValue() {
  const sequenceDoc = await CounterCompany.findByIdAndUpdate(
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
    const newDoc = await CounterCompany.create({ _id: 'companyId', sequence_value: 1000 });
    return newDoc.sequence_value;
  }

  return sequenceDoc.sequence_value;
}

// Initialize the counter only if necessary
async function initializeCounter() {
  const counter = await CounterCompany.findById('tripId');
  if (!counter) {
    await CounterCompany.create({ _id: 'tripId', sequence_value: 1000 });
  }
}

// Export the model and the sequence function
module.exports = {
    CounterCompany,
    getCompanyNextSequenceValue
};
