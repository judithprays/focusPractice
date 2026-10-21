# A Focus Practice
A time management technique that has little to do with time 

## Product thesis
We actually have enough time. What we need is to work on our focus muscle.

The practice:
Choose → Focus → Learn → Push Through → Complete → Share → Recover → Choose again

## Current status
I read 20 time management books and did 12 experiments on myself to uncover how to feel more satisfaction and productivity with my time. 
This is the process that is consistently working for me - and now I'm wondering if it works for other people.  


## Shareable focuses MVP setup

1. Run `supabase/migrations/20261020_shareable_focuses.sql` in the Supabase SQL Editor.
2. Deploy the app and create Judith's account.
3. Find the account UUID in Supabase SQL Editor:
   ```sql
   select id, email from auth.users where email = 'YOUR_ACCOUNT_EMAIL';
   ```
4. Replace `YOUR_ACCOUNT_UUID` with that UUID and run this one-time claim to associate every existing focus (and therefore its logs) with your account:
   ```sql
   update public.focuses set owner_id = 'YOUR_ACCOUNT_UUID' where owner_id is null;
   ```
5. Verify the existing focuses open and are editable when signed in. Signed-out visitors and other accounts can view public focuses but cannot edit them.

The legacy claim is deliberately manual so a random new account cannot claim your existing work.


## Profile picture uploads

After the shareability migration, run `supabase/migrations/20261020_profile_image_uploads.sql` in the Supabase SQL Editor. It creates the public `profile-images` storage bucket and limits uploads, replacements, and deletes to the signed-in owner. Profile pictures can then be uploaded from the profile's pencil/edit control.
