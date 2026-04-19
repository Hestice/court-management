"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateFacilitySettings } from "./actions";
import { facilitySettingsSchema, type FacilitySettingsValues } from "./schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function SettingsForm({ defaults }: { defaults: FacilitySettingsValues }) {
  const [pending, startTransition] = useTransition();

  const form = useForm<FacilitySettingsValues>({
    resolver: zodResolver(facilitySettingsSchema),
    defaultValues: defaults,
  });

  function onSubmit(values: FacilitySettingsValues) {
    startTransition(async () => {
      const result = await updateFacilitySettings(values);
      if (result.success) {
        toast.success("Settings saved");
        // revalidatePath() in the server action re-renders this page with
        // fresh data; no extra router.refresh() needed.
        form.reset(values);
      } else {
        toast.error(result.error ?? "Failed to save settings.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <FormField
          control={form.control}
          name="facility_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Facility name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="operating_hours_start"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operating hours start</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={23}
                    step={1}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 0 : e.target.valueAsNumber,
                      )
                    }
                    value={Number.isFinite(field.value) ? field.value : ""}
                  />
                </FormControl>
                <FormDescription>24-hour. 8 means 8:00am.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="operating_hours_end"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operating hours end</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={24}
                    step={1}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 0 : e.target.valueAsNumber,
                      )
                    }
                    value={Number.isFinite(field.value) ? field.value : ""}
                  />
                </FormControl>
                <FormDescription>24-hour. 22 means 10:00pm.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="pending_expiry_hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pending booking expiry (hours)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 1 : e.target.valueAsNumber,
                      )
                    }
                    value={Number.isFinite(field.value) ? field.value : ""}
                  />
                </FormControl>
                <FormDescription>
                  How long a booking stays pending before admin can expire it.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="max_booking_duration_hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum booking duration (hours)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={24}
                    step={1}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 1 : e.target.valueAsNumber,
                      )
                    }
                    value={Number.isFinite(field.value) ? field.value : ""}
                  />
                </FormControl>
                <FormDescription>
                  Longest single booking a customer can make.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="entrance_pass_price_per_guest"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entrance pass price per guest (₱)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  {...field}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === "" ? 0 : e.target.valueAsNumber,
                    )
                  }
                  value={Number.isFinite(field.value) ? field.value : ""}
                />
              </FormControl>
              <FormDescription>
                Charged per guest on an entrance pass purchase.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
