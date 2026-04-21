'use client';

import { useState, useRef, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  X,
  Upload,
  FileText,
  Loader2,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Textarea } from '@kit/ui/textarea';
import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';

import {
  createTicketSchema,
  type CreateTicketInput,
} from '~/lib/schemas/ticket.schema';
import { createTicket } from '~/lib/actions/tickets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface Organization {
  id: string;
  name: string;
}

interface CreateTicketFormProps {
  categories: Category[];
  contacts: Contact[];
  organizations?: Organization[];
  lockedOrganizationId?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKET_TYPES = [
  { value: 'incident', label: 'Incident' },
  { value: 'request', label: 'Request' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'support', label: 'Support' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'desarrollo_pendiente', label: 'Desarrollo Pendiente' },
] as const;

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateTicketForm({
  categories,
  contacts,
  organizations = [],
  lockedOrganizationId = null,
}: CreateTicketFormProps) {
  const lockedOrg = lockedOrganizationId
    ? organizations.find((o) => o.id === lockedOrganizationId) ?? null
    : null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tags state
  const [tagInput, setTagInput] = useState('');

  // Attachments state
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Requester autocomplete state
  const [requesterSearch, setRequesterSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // React Hook Form
  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'incident',
      urgency: 'medium',
      impact: 'medium',
      organization_id: lockedOrganizationId ?? undefined,
      category_id: undefined,
      requester_id: undefined,
      requester_email: undefined,
      tags: [],
    },
  });

  const tags = form.watch('tags') ?? [];

  // Filtered contacts for autocomplete
  const filteredContacts = useMemo(() => {
    if (!requesterSearch.trim()) return contacts.slice(0, 10);
    const query = requesterSearch.toLowerCase();
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query),
      )
      .slice(0, 10);
  }, [contacts, requesterSearch]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const current = form.getValues('tags') ?? [];
    if (current.includes(trimmed)) {
      setTagInput('');
      return;
    }
    form.setValue('tags', [...current, trimmed], { shouldValidate: true });
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
    if (e.key === 'Backspace' && !tagInput) {
      const current = form.getValues('tags') ?? [];
      if (current.length > 0) {
        form.setValue('tags', current.slice(0, -1), { shouldValidate: true });
      }
    }
  };

  const handleRemoveTag = (tag: string) => {
    const current = form.getValues('tags') ?? [];
    form.setValue(
      'tags',
      current.filter((t) => t !== tag),
      { shouldValidate: true },
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectContact = (contact: Contact) => {
    // Set both id + email so the list view (which joins on requester_id)
    // shows the contact's name, not just the raw email.
    form.setValue('requester_id', contact.id, { shouldValidate: true });
    form.setValue('requester_email', contact.email, { shouldValidate: true });
    setRequesterSearch(contact.email);
    setShowContactDropdown(false);
  };

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const result = await createTicket(data);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Ticket created successfully');
      router.push('/home/tickets');
    });
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/home/tickets">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Create Ticket
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Fill in the details below to create a new ticket
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        <Form {...form}>
          <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Provide the essential details for this ticket
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Organization */}
                {lockedOrg ? (
                  <FormItem>
                    <FormLabel>Organization</FormLabel>
                    <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm font-medium">
                      {lockedOrg.name}
                    </div>
                    <input
                      type="hidden"
                      {...form.register('organization_id')}
                      value={lockedOrg.id}
                    />
                  </FormItem>
                ) : (
                  organizations.length > 0 && (
                    <FormField
                      control={form.control}
                      name="organization_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value ?? undefined}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select organization" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {organizations.map((org) => (
                                <SelectItem key={org.id} value={org.id}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )
                )}

                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Title <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Brief summary of the issue or request"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Description <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the issue in detail. Include steps to reproduce, expected behavior, and any relevant context."
                          className="min-h-[150px] resize-y"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Type + Category (2-column) */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Type */}
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TICKET_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value ?? undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Severity */}
            <Card>
              <CardHeader>
                <CardTitle>Severity</CardTitle>
                <CardDescription>
                  Set the urgency and impact to determine ticket priority
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Urgency */}
                  <FormField
                    control={form.control}
                    name="urgency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Urgency</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select urgency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SEVERITY_LEVELS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Impact */}
                  <FormField
                    control={form.control}
                    name="impact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Impact</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select impact" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SEVERITY_LEVELS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Requester + Tags */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Details</CardTitle>
                <CardDescription>
                  Set the requester, add tags, and attach files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Requester Email with autocomplete */}
                <FormField
                  control={form.control}
                  name="requester_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requester Email</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            placeholder="Search by name or email..."
                            value={requesterSearch}
                            onChange={(e) => {
                              setRequesterSearch(e.target.value);
                              field.onChange(e.target.value || undefined);
                              // User is editing the email manually — any
                              // previously-selected contact no longer applies.
                              form.setValue('requester_id', undefined);
                              setShowContactDropdown(true);
                            }}
                            onFocus={() => setShowContactDropdown(true)}
                            onBlur={() => {
                              // Delay to allow click on dropdown item
                              setTimeout(() => setShowContactDropdown(false), 200);
                            }}
                          />
                        </FormControl>
                        {/* Autocomplete dropdown */}
                        {showContactDropdown && filteredContacts.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                            <ul className="max-h-48 overflow-auto py-1">
                              {filteredContacts.map((contact) => (
                                <li key={contact.id}>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectContact(contact);
                                    }}
                                  >
                                    <span className="font-medium text-gray-900">
                                      {contact.name}
                                    </span>
                                    <span className="text-gray-500">
                                      {contact.email}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags */}
                <div className="space-y-2">
                  <FormLabel>Tags</FormLabel>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pl-2 pr-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-gray-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <input
                      type="text"
                      placeholder={tags.length === 0 ? 'Type a tag and press Enter...' : 'Add more...'}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={handleAddTag}
                      disabled={!tagInput.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <FormLabel>Attachments</FormLabel>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv,.zip"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Upload Files
                    </Button>

                    {attachments.length > 0 && (
                      <ul className="space-y-1">
                        {attachments.map((file, idx) => (
                          <li
                            key={`${file.name}-${idx}`}
                            className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                          >
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="flex-1 truncate text-gray-700">
                              {file.name}
                            </span>
                            <span className="text-xs text-gray-400">
                              {(file.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pb-6">
              <Link href="/home/tickets">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? 'Creating...' : 'Create Ticket'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
