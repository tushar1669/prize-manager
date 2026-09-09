import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter, socialLinks } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONTACT_EMAIL = "chess.tushar@gmail.com";

const messageTypes = [
  { value: "bug", label: "Bug" },
  { value: "suggestion", label: "Suggestion" },
  { value: "question", label: "Question" },
] as const;

type FormState = {
  name: string;
  email: string;
  type: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = { name: "", email: "", type: "", message: "" };

export default function Contact() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!form.name.trim()) nextErrors.name = "Name is required.";
    if (!form.email.trim()) nextErrors.email = "Email is required.";
    if (!form.type) nextErrors.type = "Please choose a type.";
    if (!form.message.trim()) nextErrors.message = "Message is required.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const typeLabel = messageTypes.find((t) => t.value === form.type)?.label ?? form.type;
    const subject = `[${typeLabel}] from ${form.name}`;
    const body = `${form.message}\n\n— ${form.name} (${form.email})`;
    const mailtoUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <>
      <Seo
        title="Contact | Prize Manager"
        description="Get in touch with Prize Manager by email or social media, or send a message through the contact form."
        path="/contact"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto space-y-10">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-4">Contact</h1>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 text-lg font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  <Mail className="h-5 w-5" aria-hidden="true" />
                  {CONTACT_EMAIL}
                </a>

                <div className="flex items-center gap-3 mt-4">
                  {socialLinks.map(({ label, href, Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input
                    id="contact-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    aria-invalid={!!errors.name}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-type">Type</Label>
                  <Select value={form.type} onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}>
                    <SelectTrigger id="contact-type" aria-invalid={!!errors.type}>
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      {messageTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    id="contact-message"
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    aria-invalid={!!errors.message}
                  />
                  {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
                </div>

                {/* TODO: this composes a mailto: link only; a table-backed form is the follow-up */}
                <Button type="submit">Send message</Button>
              </form>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
