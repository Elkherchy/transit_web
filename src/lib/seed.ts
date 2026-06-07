import connectDB from './db';
import { DesignationConfig } from '../models';
import { DESIGNATIONS_DEFAULT } from '../types';

async function seedDatabase() {
  try {
    await connectDB();
    console.log('Connected to database');

    // Check if designations already exist
    const existingCount = await DesignationConfig.countDocuments();
    
    if (existingCount === 0) {
      console.log('Creating default designations...');
      
      const designations = DESIGNATIONS_DEFAULT.map((nom, index) => ({
        nom,
        actif: true,
        ordre: index,
      }));

      await DesignationConfig.insertMany(designations);
      console.log(`Created ${designations.length} default designations`);
    } else {
      console.log('Designations already exist, skipping...');
    }

    console.log('Database seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
