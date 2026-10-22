import { Redirect } from 'expo-router';

// The signed-out guard sends people to this group's index.
export default function AuthIndex() {
  return <Redirect href="/login" />;
}
