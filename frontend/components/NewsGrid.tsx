/**
 * NewsGrid —— 首页 Latest News 区块的服务端卡片网格。
 * 保持卡片交互，同时避免为装饰性入场动画注入客户端动画运行时。
 */

import type { PostSummary } from "@/lib/types";
import PostCard from "@/components/PostCard";

interface NewsGridProps {
  posts: PostSummary[];
}

export default function NewsGrid({ posts }: NewsGridProps) {
  return (
    <div className="news-editorial grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6">
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} showAuthor={false} sizes={index === 0 ? "(max-width: 1023px) calc(100vw - 48px), (max-width: 1279px) calc(55.556vw - 40px), 672px" : "(max-width: 767px) calc(100vw - 48px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(19.753vw - 15px), 240px"} />
      ))}
    </div>
  );
}
