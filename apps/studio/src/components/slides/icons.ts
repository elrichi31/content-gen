import {
  ArrowRight, ArrowUpRight, Asterisk, Award, Bell, Bookmark, Brain, Calendar, Camera, Check, Clock, Code, Cpu, DollarSign, Eye, Flame,
  Gift, Globe, Hash, Heart, Leaf, Lightbulb, Link, Lock, Mail, MapPin, Megaphone, MessageCircle, Moon, Music, Percent, Play, Quote,
  Recycle, Rocket, Shield, ShoppingBag, Smartphone, Sparkles, Star, Sun, Target, TrendingUp, Trophy, User, Users, X, Zap, type LucideIcon,
} from "lucide-react"

/*
 * Iconos que puede llevar un slide, por su nombre en Lucide. Sin "use client": el servidor MCP lee
 * las claves para decirle al agente cuáles existen.
 */
// ponytail: lista curada e importada a mano; si se queda corta, pasar a lucide-react/dynamic con buscador.
export const SLIDE_ICONS: Record<string, LucideIcon> = {
  asterisk: Asterisk, sparkles: Sparkles, star: Star, heart: Heart, zap: Zap, flame: Flame, lightbulb: Lightbulb, rocket: Rocket,
  target: Target, "trending-up": TrendingUp, check: Check, x: X, "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, quote: Quote, "message-circle": MessageCircle,
  megaphone: Megaphone, bell: Bell, bookmark: Bookmark, eye: Eye, clock: Clock, calendar: Calendar, "map-pin": MapPin, globe: Globe,
  leaf: Leaf, recycle: Recycle, sun: Sun, moon: Moon, camera: Camera, music: Music, play: Play, "shopping-bag": ShoppingBag,
  gift: Gift, "dollar-sign": DollarSign, percent: Percent, award: Award, trophy: Trophy, users: Users, user: User, lock: Lock,
  shield: Shield, brain: Brain, code: Code, cpu: Cpu, smartphone: Smartphone, mail: Mail, link: Link, hash: Hash,
}
