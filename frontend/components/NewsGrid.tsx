"use client";

/**
 * NewsGrid —— 首页 Latest News 区块的卡片网格（客户端组件）
 * 滚动进入视口时，三张卡片依次从下方错落浮现（y:24 → 0，scale:0.96 → 1），
 * stagger 0.12s，仅触发一次；尊重系统“减少动态效果”偏好。
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { PostSummary } from "@/lib/types";
import PostCard from "@/components/PostCard";

interface NewsGridProps {
  posts: PostSummary[];
}

// 容器：负责按子项顺序错开入场
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

// 单卡：从下方 + 轻微缩小浮现
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function NewsGrid({ posts }: NewsGridProps) {
  const prefersReducedMotion = useReducedMotion();

  // 尊重 prefers-reduced-motion：直接渲染静态网格，无动画
  if (prefersReducedMotion) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} showAuthor={false} />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-50px" }}
    >
      {posts.map((post) => (
        <motion.div key={post.id} variants={itemVariants}>
          <PostCard post={post} showAuthor={false} />
        </motion.div>
      ))}
    </motion.div>
  );
}
