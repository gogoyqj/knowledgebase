"""
发布节点 - 微信公众号发布 + 飞书通知

复用 article_pipeline 已有的微信/飞书接口逻辑。
"""

import os
import json
import httpx
import markdown
from pathlib import Path


class WeChatPublisher:
    """微信公众号发布器"""

    def __init__(self, config: dict):
        self.config = config
        self.wechat_config = config.get("wechat", {})
        self.app_id = self.wechat_config.get("app_id", "")
        self.app_secret = self.wechat_config.get("app_secret", "")
        self.author = self.wechat_config.get("author", "skia")
        self.theme = self.wechat_config.get("design_theme", "economist")
        self.creation_source_type = self.wechat_config.get("creation_source_type", 1)
        self._access_token = None

    async def _get_access_token(self) -> str:
        """获取微信 access_token"""
        if self._access_token:
            return self._access_token

        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": self.app_id,
            "secret": self.app_secret,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params)
            data = resp.json()
            if "access_token" in data:
                self._access_token = data["access_token"]
                return self._access_token
            else:
                raise Exception(f"获取 access_token 失败: {data}")

    def _md_to_html(self, md_content: str) -> str:
        """Markdown 转 HTML"""
        html = markdown.markdown(
            md_content,
            extensions=["extra", "codehilite", "toc"]
        )
        return html

    async def _upload_image(self, image_path: str) -> str:
        """上传图片获取 media_id"""
        token = await self._get_access_token()
        url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}"

        with open(image_path, "rb") as f:
            files = {"media": (os.path.basename(image_path), f, "image/png")}
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, files=files)
                data = resp.json()
                return data.get("url", "")

    async def publish(self, title: str, article_path: str,
                      cover_path: str = None, dry_run: bool = True) -> dict:
        """发布文章到微信公众号

        Args:
            title: 文章标题
            article_path: 文章 markdown 文件路径
            cover_path: 封面图路径
            dry_run: True=仅创建草稿, False=发布

        Returns:
            dict: {"media_id": str, "draft_only": bool, ...}
        """
        # 读取文章内容
        with open(article_path, "r", encoding="utf-8") as f:
            md_content = f.read()

        # 转换为 HTML
        html_content = self._md_to_html(md_content)

        # 上传封面图
        thumb_media_id = ""
        if cover_path and os.path.exists(cover_path):
            thumb_media_id = await self._upload_image(cover_path)

        # 构建请求
        article = {
            "title": title,
            "author": self.author,
            "content": html_content,
            "thumb_media_id": thumb_media_id,
            "content_source_url": "",
            "need_open_comment": 1,
            "only_fans_can_comment": 0,
            "creation_source_type": self.creation_source_type,
        }

        # 保存草稿
        token = await self._get_access_token()
        draft_url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(draft_url, json={"articles": [article]})
            data = resp.json()

        result = {
            "media_id": data.get("media_id", ""),
            "draft_only": True,
        }

        # 如果不是 dry_run，发布
        if not dry_run and result["media_id"]:
            publish_url = f"https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token={token}"
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(publish_url, json={
                    "media_id": result["media_id"]
                })
                publish_data = resp.json()
                result["draft_only"] = False
                result["publish_id"] = publish_data.get("publish_id", "")

        return result


class FeishuNotifier:
    """飞书通知器"""

    def __init__(self, config: dict):
        self.config = config
        self.feishu_config = config.get("feishu", {})
        self.enabled = self.feishu_config.get("enabled", False)
        self.app_id = self.feishu_config.get("app_id", "")
        self.app_secret = self.feishu_config.get("app_secret", "")
        self.recipients = self.feishu_config.get("recipients", [])
        self._tenant_token = None

    async def _get_tenant_token(self) -> str:
        """获取飞书 tenant_access_token"""
        if self._tenant_token:
            return self._tenant_token

        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={
                "app_id": self.app_id,
                "app_secret": self.app_secret,
            })
            data = resp.json()
            self._tenant_token = data.get("tenant_access_token", "")
            return self._tenant_token

    async def notify(self, title: str, summary: str,
                     platform: str = "wechat", article_url: str = None) -> dict:
        """发送飞书通知"""
        if not self.enabled:
            return {"status": "skipped", "reason": "feishu not enabled"}

        token = await self._get_tenant_token()

        status = "已发布" if article_url else "待发布"
        url_part = f"\n链接: {article_url}" if article_url else ""

        card = {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"content": f"📝 文章{status}: {title}", "tag": "plain_text"},
                "template": "green" if article_url else "orange",
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "content": f"**标题**: {title}\n**平台**: {platform}\n**摘要**: {summary}{url_part}",
                        "tag": "lark_md"
                    }
                }
            ]
        }

        results = []
        for recipient in self.recipients:
            receive_id = recipient.get("id", "")
            receive_type = recipient.get("type", "user")
            id_type_map = {"user": "open_id", "group": "chat_id"}
            receive_id_type = id_type_map.get(receive_type, "open_id")

            url = f"https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type={receive_id_type}"
            async with httpx.AsyncClient() as client:
                resp = await client.post(url,
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "receive_id": receive_id,
                        "msg_type": "interactive",
                        "content": json.dumps(card),
                    }
                )
                results.append(resp.json())

        return {"status": "sent", "results": results}
