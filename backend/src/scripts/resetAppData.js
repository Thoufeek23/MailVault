const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const EmailMeta = require('../models/EmailMeta');
const User = require('../models/User');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const hasConfirmFlag = process.argv.includes('--confirm');

if (!hasConfirmFlag) {
  console.log('This is a destructive operation.');
  console.log('Run: npm run dev:reset-data -- --confirm');
  process.exit(1);
}

const clearSupabaseBackups = async (pathsFromDb) => {
  const supabaseUrl = process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const legacyKey = process.env.SUPABASE_KEY && process.env.SUPABASE_KEY.trim();
  const selectedKey = serviceRoleKey || legacyKey;

  if (!supabaseUrl || !selectedKey) {
    console.log('Supabase credentials not found. Skipping storage cleanup.');
    return;
  }

  const paths = [...new Set((pathsFromDb || []).filter(Boolean))];
  if (paths.length === 0) {
    console.log('No backup files to delete from Supabase.');
    return;
  }

  const supabase = createClient(supabaseUrl, selectedKey);
  const chunkSize = 100;
  let removed = 0;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from('email-backups').remove(chunk);

    if (error) {
      throw new Error(`Supabase cleanup failed: ${error.message}`);
    }

    removed += chunk.length;
  }

  console.log(`Deleted ${removed} backup file(s) from Supabase.`);
};

const resetData = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing in backend/.env');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const backupPaths = await EmailMeta.find({ supabasePath: { $exists: true, $ne: null } })
      .select('supabasePath -_id')
      .lean();

    await clearSupabaseBackups(backupPaths.map((doc) => doc.supabasePath));

    const emailResult = await EmailMeta.deleteMany({});
    const userResult = await User.deleteMany({});

    console.log(`Deleted ${emailResult.deletedCount} email metadata document(s).`);
    console.log(`Deleted ${userResult.deletedCount} user document(s).`);
    console.log('Application data reset completed.');
  } catch (error) {
    console.error('Reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

resetData();

//npm run dev:reset-data -- --confirm 

