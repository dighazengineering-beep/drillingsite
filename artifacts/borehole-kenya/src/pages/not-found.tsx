import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Sorry, we could not find the page you are looking for. It may have moved or the address may be wrong.
          </p>
          <a href="/" className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Go to the home page</a>
        </CardContent>
      </Card>
    </div>
  );
}
