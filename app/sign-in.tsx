import { BrandMark } from "@/components/brand-mark";

export default function SignIn({ unavailable = false, failed = false, expired = false }: {
  unavailable?: boolean; failed?: boolean; expired?: boolean;
}) {
  return <main className="sign-in-page">
    <section className="sign-in-card">
      <div className="brand"><BrandMark /><span>Gramello</span></div>
      <h1>Your nutrition,<br />in one place.</h1>
      <p>Keep your food diary, daily goals, and progress together in your own account.</p>
      {unavailable ? <p role="status">Sign-in is temporarily unavailable. Please try again later.</p> : <>
        {failed && <p className="auth-notice" role="alert">We couldn’t complete sign-in. Please try again.</p>}
        {expired && <p className="auth-notice" role="status">Your session has expired. Sign in again to continue.</p>}
        <a className="sign-in-button" href="/auth/login">Sign in to Gramello</a>
        <span className="sign-in-note">Secure sign-in with Auth0</span>
      </>}
    </section>
  </main>;
}
