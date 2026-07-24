/*
 * Hook：useModal — 模态框状态管理
 * 职责：封装 isOpen/openModal/closeModal 三元组，用于控制 ConfirmDialog 等模态框。
 * 搭配 ConfirmDialog 组件使用（删除确认等场景）。
 */
"use client";
import { useState, useCallback } from "react";

export const useModal = (initialState: boolean = false) => {
  const [isOpen, setIsOpen] = useState(initialState);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, openModal, closeModal, toggleModal };
};
