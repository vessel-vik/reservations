/* eslint-disable no-unused-vars */
"use client";

import { E164Number } from "libphonenumber-js/core";
import Image from "next/image";
import ReactDatePicker from "react-datepicker";
import { Control } from "react-hook-form";
import PhoneInput from "react-phone-number-input";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Calendar, Clock, ChevronDown } from "lucide-react";
import { GuestCounter } from "./ui/GuestCounter";

import { Checkbox } from "./ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { DatePicker } from "./ui/date-picker";
import { DateTimePicker } from "./ui/date-time-picker";

export enum FormFieldType {
  INPUT = "input",
  TEXTAREA = "textarea",
  PHONE_INPUT = "phoneInput",
  CHECKBOX = "checkbox",
  DATE_PICKER = "datePicker",
  CALENDAR = "calendar",
  DATETIME_PICKER = "datetimePicker",
  SELECT = "select",
  SKELETON = "skeleton",
  GUEST_COUNTER = "guestCounter",
}

interface CustomProps {
  control: Control<any>;
  name: string;
  label?: string;
  placeholder?: string;
  iconSrc?: string;
  iconAlt?: string;
  disabled?: boolean;
  dateFormat?: string;
  showTimeSelect?: boolean;
  children?: React.ReactNode;
  renderSkeleton?: (field: any) => React.ReactNode;
  fieldType: FormFieldType;
}

const RenderInput = ({ field, props }: { field: any; props: CustomProps }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(!!field.value);

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => {
    setIsFocused(false);
    setHasValue(!!field.value);
  };

  switch (props.fieldType) {
    case FormFieldType.INPUT:
      return (
        <motion.div
          className="flex rounded-xl border border-slate-700/50 bg-slate-800/50 relative overflow-hidden"
          whileTap={{ scale: 0.995 }}
          animate={{
            borderColor: isFocused ? "rgb(251 191 36)" : "rgb(64 64 64)",
          }}
          transition={{ duration: 0.2 }}
        >
          {props.iconSrc && (
            <motion.div
              animate={{
                scale: isFocused ? 1.1 : 1,
                rotate: isFocused ? 10 : 0,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Image
                src={props.iconSrc}
                height={24}
                width={24}
                alt={props.iconAlt || "icon"}
                className="ml-2"
              />
            </motion.div>
          )}
          <FormControl>
            <Input
              placeholder={props.placeholder}
              {...field}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(e) => {
                field.onChange(e);
                setHasValue(!!e.target.value);
              }}
              className="shad-input border-0 transition-all duration-200 text-white placeholder:text-gray-400"
            />
          </FormControl>
          {/* Focus indicator */}
          <motion.div
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-amber-400 to-amber-600"
            initial={{ width: "0%" }}
            animate={{ width: isFocused ? "100%" : "0%" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </motion.div>
      );

    case FormFieldType.TEXTAREA:
      return (
        <motion.div
          whileTap={{ scale: 0.995 }}
          className="relative"
        >
          <FormControl>
            <Textarea
              placeholder={props.placeholder}
              {...field}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="shad-textArea transition-all duration-200 hover:border-amber-500/50 focus:border-amber-500 text-white placeholder:text-gray-400"
              disabled={props.disabled}
            />
          </FormControl>
          {/* Character count animation */}
          <AnimatePresence>
            {isFocused && field.value && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute -bottom-5 right-0 text-xs text-gray-400"
              >
                {field.value.length} characters
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );

    case FormFieldType.PHONE_INPUT:
      return (
        <motion.div
          whileTap={{ scale: 0.995 }}
          className="relative"
        >
          <FormControl>
            <PhoneInput
              defaultCountry="KE"
              placeholder={props.placeholder}
              international
              withCountryCallingCode
              value={field.value as E164Number | undefined}
              onChange={field.onChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="input-phone transition-all duration-200"
            />
          </FormControl>
          {/* Animated phone icon */}
          <motion.div
            className="absolute right-3 top-1/2 -translate-y-1/2"
            animate={{
              scale: isFocused ? [1, 1.2, 1] : 1,
            }}
            transition={{
              duration: 0.5,
              repeat: isFocused ? Infinity : 0,
              repeatDelay: 2,
            }}
          >
            📱
          </motion.div>
        </motion.div>
      );

    case FormFieldType.CHECKBOX:
      return (
        <FormControl>
          <motion.div
            className="flex items-center gap-4"
            whileTap={{ scale: 0.95 }}
          >
            <Checkbox
              id={props.name}
              checked={field.value}
              onCheckedChange={field.onChange}
              className="transition-all duration-200"
            />
            <label
              htmlFor={props.name}
              className="checkbox-label cursor-pointer select-none"
            >
              {props.label}
            </label>
          </motion.div>
        </FormControl>
      );

    case FormFieldType.DATE_PICKER:
      return (
        <motion.div
          className="flex rounded-xl border border-slate-700/50 bg-slate-800/50 relative overflow-hidden"
          whileTap={{ scale: 0.995 }}
          animate={{
            borderColor: isFocused ? "rgb(251 191 36)" : "rgb(64 64 64)",
          }}
        >
          <motion.div
            className="ml-2 flex items-center"
            animate={{
              rotate: isFocused ? [0, -10, 10, -10, 0] : 0,
            }}
            transition={{
              duration: 0.5,
            }}
          >
            <Calendar className="h-5 w-5 text-amber-500" />
          </motion.div>
          <FormControl>
            <ReactDatePicker
              showTimeSelect={props.showTimeSelect ?? false}
              selected={field.value}
              onChange={(date: Date | null) => field.onChange(date)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              timeInputLabel="Time:"
              dateFormat={props.dateFormat ?? "MM/dd/yyyy"}
              wrapperClassName="date-picker"
              placeholderText={props.placeholder}
              minDate={props.showTimeSelect ? new Date() : undefined}
              maxDate={!props.showTimeSelect ? new Date() : undefined}
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={100}
              className="text-white placeholder:text-gray-400"
            />
          </FormControl>
          {props.showTimeSelect && (
            <motion.div
              className="mr-2 flex items-center"
              animate={{
                rotate: isFocused ? 360 : 0,
              }}
              transition={{
                duration: 1,
                ease: "linear",
              }}
            >
              <Clock className="h-4 w-4 text-amber-500/70" />
            </motion.div>
          )}
          {/* Focus indicator */}
          <motion.div
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-amber-400 to-amber-600"
            initial={{ width: "0%" }}
            animate={{ width: isFocused ? "100%" : "0%" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </motion.div>
      );

    case FormFieldType.CALENDAR:
      return (
        <FormControl>
          <DatePicker
            date={field.value}
            onDateChange={field.onChange}
            placeholder={props.placeholder}
            disabled={props.disabled}
            minDate={new Date()}
            maxDate={new Date(new Date().setFullYear(new Date().getFullYear() + 1))}
            className="w-full"
          />
        </FormControl>
      );

    case FormFieldType.DATETIME_PICKER:
      return (
        <FormControl>
          <DateTimePicker
            date={field.value}
            onDateTimeChange={field.onChange}
            placeholder={props.placeholder || "Select date and time"}
            disabled={props.disabled}
            minDate={new Date()}
            maxDate={new Date(new Date().setFullYear(new Date().getFullYear() + 1))}
            className="w-full"
          />
        </FormControl>
      );

    case FormFieldType.SELECT:
      return (
        <FormControl>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <motion.div whileTap={{ scale: 0.995 }}>
              <SelectTrigger
                className="shad-select-trigger transition-all duration-200 hover:border-amber-500/50 focus:border-amber-500 text-white"
                onFocus={handleFocus}
                onBlur={handleBlur}
              >
                <SelectValue placeholder={props.placeholder}>
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {field.value || props.placeholder}
                  </motion.span>
                </SelectValue>
                <motion.div
                  animate={{
                    rotate: isFocused ? 180 : 0,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown className="h-4 w-4 text-amber-500" />
                </motion.div>
              </SelectTrigger>
            </motion.div>
            <SelectContent className="shad-select-content">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {props.children}
              </motion.div>
            </SelectContent>
          </Select>
        </FormControl>
      );

    case FormFieldType.SKELETON:
      return props.renderSkeleton ? props.renderSkeleton(field) : null;

    case FormFieldType.GUEST_COUNTER:
      return (
        <FormControl>
          <GuestCounter
            value={field.value}
            onChange={field.onChange}
          />
        </FormControl>
      );

    default:
      return null;
  }
};

const CustomFormField = (props: CustomProps) => {
  const { control, name, label } = props;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1">
          {label && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <FormLabel className="shad-input-label">{label}</FormLabel>
            </motion.div>
          )}
          <RenderInput field={field} props={props} />
          <AnimatePresence mode="wait">
            <FormMessage className="shad-error">
              <motion.span
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
              />
            </FormMessage>
          </AnimatePresence>
        </FormItem>
      )}
    />
  );
};

export default CustomFormField;