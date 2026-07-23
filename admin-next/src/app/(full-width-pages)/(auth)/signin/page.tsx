import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Songdian Admin",
  description: "Sign in to Songdian Technology Admin Dashboard",
};

export default function SignIn() {
  return <SignInForm />;
}
