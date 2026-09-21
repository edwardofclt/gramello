import { BadgeCheck } from 'lucide-react';

export function FoodVerification({ verified }: { verified?: boolean }) {
  return <span className={`food-verification ${verified ? 'verified' : 'unverified'}`}
    title={verified ? 'Nutrition from an official restaurant source or nutrition database.' : 'User-submitted or otherwise unverified nutrition.'}>
    {verified && <BadgeCheck aria-hidden="true"/>}{verified ? 'Verified' : 'Unverified'}
  </span>;
}
